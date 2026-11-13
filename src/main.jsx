import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import data from './data.json';
import { fetchWalkingRoute } from './routing.js';

const icon = (type, label) => L.divIcon({ className: 'custom-pin', html: `<span class="pin ${type}">${label}</span>`, iconSize: [36, 44], iconAnchor: [18, 40] });
function Map({ selected, stores, atm, route, onSelect, mapRef, onError }) {
  const element = useRef(null);
  useEffect(() => {
    const map = L.map(element.current, { zoomControl: false }).setView(selected.position, 16);
    mapRef.current = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    map.attributionControl.addAttribution('経路: <a href="https://valhalla.openstreetmap.de/" target="_blank" rel="noreferrer">Valhalla / FOSSGIS</a>');
    tiles.on('tileerror', () => onError('地図を読み込めません。通信環境を確認してください。'));
    return () => { map.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    const group = L.layerGroup().addTo(map);
    stores.forEach(store => L.marker(store.position, { icon: icon('store', 'P'), title: store.name }).addTo(group).bindTooltip(store.name).on('click', () => onSelect(store)));
    L.marker(selected.exchange.position, { icon: icon('exchange', '↗'), title: selected.exchange.name }).addTo(group).bindTooltip(selected.exchange.name);
    if (atm) data.atms.forEach(item => L.marker(item.position, { icon: icon('atm', '¥'), title: item.name }).addTo(group).bindTooltip(item.name));
    return () => group.remove();
  }, [selected, stores, atm]);
  useEffect(() => {
    const map = mapRef.current;
    const group = L.layerGroup().addTo(map);
    const points = [selected.position, selected.exchange.position];
    if (route.status === 'ready') {
      L.polyline(route.positions, { color: '#fff', weight: 9, opacity: 0.9 }).addTo(group);
      L.polyline(route.positions, { color: '#235fc4', weight: 5, lineCap: 'round' }).addTo(group);
      points.push(...route.positions);
    }
    map.fitBounds(L.latLngBounds(points).pad(0.5), { maxZoom: 17 });
    return () => group.remove();
  }, [selected, route]);
  return <div ref={element} className="map" role="region" aria-label="店舗と景品交換所の地図" />;
}
function App() {
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('すべて');
  const [selected, setSelected] = useState(data.stores[0]);
  const [atm, setAtm] = useState(false);
  const [message, setMessage] = useState('');
  const [routeState, setRouteState] = useState({ storeId: null, status: 'loading' });
  const [routeAttempt, setRouteAttempt] = useState(0);
  const mapRef = useRef(null);
  const stores = useMemo(() => data.stores.filter(s => (area === 'すべて' || s.area === area) && `${s.name}${s.address}`.normalize('NFKC').toLowerCase().includes(query.normalize('NFKC').trim().toLowerCase())), [area, query]);
  const route = useMemo(() => routeState.storeId === selected.id ? routeState : { storeId: selected.id, status: 'loading' }, [routeState, selected]);
  useEffect(() => {
    const controller = new AbortController();
    setRouteState({ storeId: selected.id, status: 'loading' });
    // Debounce selection changes to avoid flooding the demo API.
    const timer = setTimeout(async () => {
      try {
        const result = await fetchWalkingRoute(selected.position, selected.exchange.position, { signal: controller.signal });
        if (!controller.signal.aborted) setRouteState({ storeId: selected.id, status: 'ready', ...result });
      } catch {
        if (!controller.signal.aborted) setRouteState({ storeId: selected.id, status: 'error' });
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [selected, routeAttempt]);
  function locate() {
    if (!navigator.geolocation) { setMessage('このブラウザは現在地の取得に対応していません。'); return; }
    setMessage('現在地を取得しています…');
    navigator.geolocation.getCurrentPosition(p => {
      const map = mapRef.current;
      if (!map) return;
      if (map._userLocation) map.removeLayer(map._userLocation);
      map._userLocation = L.circleMarker([p.coords.latitude, p.coords.longitude], { radius: 8, color: '#fff', weight: 3, fillColor: '#397bcc', fillOpacity: 1 }).addTo(map).bindTooltip('現在地');
      map.setView([p.coords.latitude, p.coords.longitude], 16); setMessage('現在地を地図に表示しました。');
    }, () => setMessage('現在地を取得できませんでした。ブラウザの位置情報の許可を確認してください。'), { timeout: 10000 });
  }
  return <>
    <main><aside><div className="intro"><h1>Where is TUC</h1></div>
      <label className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="店舗名・エリアで検索" aria-label="店舗名・エリアで検索" />{query && <button onClick={() => setQuery('')} aria-label="検索をクリア">×</button>}</label>
      <div className="areas" aria-label="エリア絞り込み">{['すべて', '新宿', '池袋', '上野'].map(a => <button key={a} className={area === a ? 'active' : ''} onClick={() => setArea(a)} aria-pressed={area === a}>{a}</button>)}</div>
      <div className="list-heading">店舗を選択 <span>{stores.length} 件のサンプル</span></div>
      <div className="store-list">{stores.map(s => <button key={s.id} className={`store-card ${selected.id === s.id ? 'selected' : ''}`} onClick={() => setSelected(s)} aria-pressed={selected.id === s.id}><span className="store-symbol">P</span><span><small>{s.area}エリア</small><strong>{s.name}</strong><span className="address">{s.address}</span></span><span className="chevron">›</span></button>)}{!stores.length && <div className="empty">該当する店舗がありません。<br /><button onClick={() => { setQuery(''); setArea('すべて'); }}>検索条件をリセット</button></div>}</div>
      <div className="side-footer"><span className="small-icon">i</span> 現在はデモデータで動作しています。<br />調査済みの情報を追加して対象エリアを広げます。</div>
    </aside><section className="map-section"><Map selected={selected} stores={stores} atm={atm} route={route} onSelect={setSelected} mapRef={mapRef} onError={setMessage} />
        <div className="map-tools"><div className="map-label"><span className="live-dot" /> {selected.area}周辺 <span>サンプルマップ</span></div><button onClick={locate} className="location">◎ <span>現在地</span></button></div>
        <div className="legend"><span><i className="dot green" />店舗</span><span><i className="dot orange" />交換所</span><label><input type="checkbox" checked={atm} onChange={e => setAtm(e.target.checked)} /> ATMを表示</label></div>
        {message && <div className="toast" role="status">{message}<button aria-label="メッセージを閉じる" onClick={() => setMessage('')}>×</button></div>}
        <article className="detail"><div className="detail-top"><div><div className="eyebrow">YOUR DESTINATION <span>架空データ</span></div><h2>{selected.exchange.name}</h2></div><span className="destination-icon">↗</span></div><div className="connection"><span className="dot green" />{selected.name}<span className="connection-line" />対応する交換所</div><p>{selected.exchange.note}</p>
          <div className={`route-note route-${route.status}`} role="status" aria-live="polite">
            {route.status === 'loading' && '道路に沿った徒歩経路を取得しています…'}
            {route.status === 'ready' && <><strong>徒歩 約{Math.max(1, Math.ceil(route.duration / 60))}分 <span>・ {route.distance >= 1000 ? `${(route.distance / 1000).toFixed(1)} km` : `${Math.round(route.distance)} m`}</span></strong><small>青の線が徒歩経路です。ピンが道路から離れている場合、経路は近くの通行可能な道路まで表示します。</small></>}
            {route.status === 'error' && <>徒歩経路を取得できませんでした。<button className="route-retry" onClick={() => setRouteAttempt(n => n + 1)}>再試行</button><small>通信環境を確認するか、下のGoogleマップをご利用ください。</small></>}
          </div><a className="route-button" href={`https://www.google.com/maps/dir/?api=1&origin=${selected.position.join(',')}&destination=${selected.exchange.position.join(',')}&travelmode=walking`} target="_blank" rel="noreferrer">徒歩経路をGoogleマップで確認 <span>↗</span></a><small className="route-disclaimer">サンプル地点間の経路が別タブで開きます</small>
          <details><summary>取り扱い景品について</summary><p>景品画像は未登録です。実地調査後、撮影・掲載許可を得た画像を登録します。</p></details></article>
        <div className="map-caption">見つける。つながる。たどり着く。</div>
      </section></main></>;
}
createRoot(document.getElementById('content')).render(<App />);
