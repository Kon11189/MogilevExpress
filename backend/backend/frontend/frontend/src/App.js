import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import io from 'socket.io-client';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Подключаем сокеты (Real-time)
const socket = io('http://localhost:5000'); // В реале тут будет твой домен

// Иконки для карты (фикс бага Leaflet)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function App() {
  const [role, setRole] = useState('client'); // 'client' или 'courier'
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  
  // Данные заказа
  const [pointA, setPointA] = useState(null);
  const [pointB, setPointB] = useState(null);
  const [activeOrders, setActiveOrders] = useState([]);

  // Слушаем новые заказы в реальном времени
  useEffect(() => {
    socket.on('new_order', (order) => {
      setActiveOrders((prev) => [...prev, order]);
    });
  }, []);

  // АВТОРИЗАЦИЯ
  const handleLogin = async () => {
    try {
      const res = await axios.post('http://localhost:5000/api/auth', { phone, code });
      setToken(res.data.token);
      localStorage.setItem('token', res.data.token);
      alert('Успешный вход!');
    } catch (err) {
      alert('Неверный код! Зайди в бота @MogilevExpressBot');
    }
  };

  // СОЗДАНИЕ ЗАКАЗА
  const createOrder = async () => {
    if (!pointA || !pointB) return;
    // Расчет дистанции (примерно)
    const dist = Math.round(L.latLng(pointA).distanceTo(L.latLng(pointB)));
    
    await axios.post('http://localhost:5000/api/orders', {
      clientPhone: phone,
      from: pointA,
      to: pointB,
      distance: dist
    });
    alert('Заказ создан! Курьеры уже видят его.');
    setPointA(null); setPointB(null);
  };

  // КОМПОНЕНТ КАРТЫ (КЛИКИ)
  const MapClicker = () => {
    useMapEvents({
      click(e) {
        if (!pointA) setPointA(e.latlng);
        else if (!pointB) setPointB(e.latlng);
        else { setPointA(e.latlng); setPointB(null); }
      },
    });
    return null;
  };

  if (!token) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <h2>Mogilev Express 🇧🇾</h2>
        <p>1. Зайди в бот <b>@ТвойБот</b></p>
        <p>2. Нажми "Поделиться контактом"</p>
        <p>3. Введи полученный код ниже:</p>
        <input placeholder="37529..." value={phone} onChange={e => setPhone(e.target.value)} style={{padding: 10, display: 'block', margin: '10px auto'}}/>
        <input placeholder="Код из Telegram" value={code} onChange={e => setCode(e.target.value)} style={{padding: 10, display: 'block', margin: '10px auto'}}/>
        <button onClick={handleLogin} style={{padding: 10, background: '#fc0', border: 'none', borderRadius: 5}}>Войти</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ padding: 15, background: '#fc0', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
        <span>Mogilev Express</span>
        <button onClick={() => setRole(role === 'client' ? 'courier' : 'client')}>
          Я {role === 'client' ? 'Заказчик' : 'Курьер'}
        </button>
      </header>

      {/* РЕЖИМ КЛИЕНТА */}
      {role === 'client' && (
        <div style={{ flex: 1, position: 'relative' }}>
          <MapContainer center={[53.90, 30.33]} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <MapClicker />
            {pointA && <Marker position={pointA} />}
            {pointB && <Marker position={pointB} />}
          </MapContainer>
          <div style={{ position: 'absolute', bottom: 20, left: 20, right: 20, background: 'white', padding: 20, borderRadius: 15, zIndex: 999 }}>
             <h3>Куда едем?</h3>
             <p>{pointA ? 'Точка А выбрана' : 'Нажми на карту (Точка А)'} -> {pointB ? 'Точка Б выбрана' : 'Нажми на карту (Точка Б)'}</p>
             <button onClick={createOrder} disabled={!pointB} style={{ width: '100%', padding: 15, background: 'black', color: 'white', borderRadius: 10 }}>Заказать</button>
          </div>
        </div>
      )}

      {/* РЕЖИМ КУРЬЕРА */}
      {role === 'courier' && (
        <div style={{ padding: 20, background: '#f5f5f5', flex: 1 }}>
          <h3>Доступные заказы ({activeOrders.length})</h3>
          {activeOrders.map(order => (
            <div key={order._id} style={{ background: 'white', padding: 15, marginBottom: 10, borderRadius: 10, border: '1px solid #ddd' }}>
              <div style={{ fontWeight: 'bold', fontSize: 18 }}>{order.price} BYN</div>
              <div style={{ color: 'gray' }}>Дистанция: {order.distance} м</div>
              <div style={{ marginTop: 10, fontSize: 12 }}>Комиссия сервиса: {order.commission} BYN</div>
              <button style={{ marginTop: 10, background: '#00b341', color: 'white', border: 'none', padding: 10, borderRadius: 5, width: '100%' }}>
                Взять заказ (Списать комиссию)
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
