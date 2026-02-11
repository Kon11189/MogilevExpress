require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { Telegraf } = require('telegraf');
const jwt = require('jsonwebtoken');

// --- 1. НАСТРОЙКА СЕРВЕРА ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } }); // Real-time связь

app.use(cors());
app.use(express.json());

// --- 2. БАЗА ДАННЫХ (Схемы) ---
// Пользователь (Курьер или Клиент)
const UserSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    role: { type: String, enum: ['client', 'courier'], default: 'client' },
    balance: { type: Number, default: 0 }, // Баланс курьера
    fitness: { steps: { type: Number, default: 0 }, kcal: { type: Number, default: 0 } },
    telegramId: String
});
const User = mongoose.model('User', UserSchema);

// Заказ
const OrderSchema = new mongoose.Schema({
    clientPhone: String,
    courierPhone: String,
    fromCoords: { lat: Number, lng: Number },
    toCoords: { lat: Number, lng: Number },
    price: Number,
    distance: Number,
    commission: Number, // 15%
    status: { type: String, enum: ['pending', 'active', 'completed'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', OrderSchema);

// --- 3. TELEGRAM БОТ (АВТОРИЗАЦИЯ) ---
// Бот отправляет код, только если юзер поделился контактом (защита от фейков)
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const authCodes = new Map(); // Временное хранение кодов

bot.on('contact', async (ctx) => {
    const phone = ctx.message.contact.phone_number.replace('+', '');
    if (!phone.startsWith('375')) return ctx.reply('Только белорусские номера!');
    
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    authCodes.set(phone, code);
    
    // Проверяем, есть ли юзер в базе, если нет - создаем
    let user = await User.findOne({ phone });
    if (!user) user = await User.create({ phone, telegramId: ctx.from.id });
    
    ctx.reply(`Ваш код для входа в Mogilev Express: ${code}`);
});
bot.launch();

// --- 4. API МАРШРУТЫ ---

// Вход по коду из ТГ
app.post('/api/auth', async (req, res) => {
    const { phone, code } = req.body;
    if (authCodes.get(phone) === code) {
        const user = await User.findOne({ phone });
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
        authCodes.delete(phone);
        res.json({ token, user });
    } else {
        res.status(400).json({ error: "Неверный код" });
    }
});

// Создание заказа
app.post('/api/orders', async (req, res) => {
    const { distance, from, to, clientPhone } = req.body;
    
    // Логика Могилева: 2.5 BYN старт + 0.2 BYN за 100м
    let price = 2.5;
    if (distance > 300) {
        price += Math.ceil((distance - 300) / 100) * 0.2;
    }
    price = parseFloat(price.toFixed(2));
    const commission = parseFloat((price * 0.15).toFixed(2));

    const newOrder = await Order.create({
        clientPhone, fromCoords: from, toCoords: to, distance, price, commission
    });

    // Оповещаем всех курьеров через Сокеты (Мгновенно!)
    io.emit('new_order', newOrder);
    res.json(newOrder);
});

// Курьер берет заказ
app.post('/api/orders/take', async (req, res) => {
    const { orderId, courierPhone } = req.body;
    const courier = await User.findOne({ phone: courierPhone });
    const order = await Order.findById(orderId);

    if (courier.balance < order.commission) {
        return res.status(400).json({ error: "Мало денег на балансе" });
    }

    courier.balance -= order.commission;
    order.status = 'active';
    order.courierPhone = courierPhone;
    
    await courier.save();
    await order.save();
    
    res.json({ success: true });
});

// --- ЗАПУСК ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

server.listen(5000, () => console.log('Server running on port 5000'));
