'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Navigation, MousePointer2, Loader, AlertCircle, ChevronRight } from 'lucide-react';

interface LocationSelectorProps {
  onSelect: (data: {
    address: string;
    lat: number;
    lng: number;
    name?: string;
  }) => void;
  initialValue?: {
    address?: string;
    lat?: string | number;
    lng?: string | number;
    name?: string;
  };
}

export default function LocationSelector({ onSelect, initialValue }: LocationSelectorProps) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isPostcodeOpen, setIsPostcodeOpen] = useState(false);
  const [status, setStatus] = useState<{type: 'error' | 'success' | 'info', msg: string} | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<{name?: string, address: string, lat: number, lng: number} | null>(
    initialValue?.lat ? { 
      name: initialValue.name, 
      address: initialValue.address || '', 
      lat: Number(initialValue.lat), 
      lng: Number(initialValue.lng) 
    } : null
  );

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const postcodeContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const initMap = () => {
    if (!mapContainerRef.current || !window.kakao?.maps || mapInstanceRef.current) return;
    
    const { maps } = window.kakao;
    const initialPos = selectedPlace 
      ? new maps.LatLng(selectedPlace.lat, selectedPlace.lng)
      : new maps.LatLng(37.5665, 126.9780);

    const options = { center: initialPos, level: 3 };
    const map = new maps.Map(mapContainerRef.current, options);
    mapInstanceRef.current = map;

    const marker = new maps.Marker({ 
      position: initialPos, 
      draggable: true,
      map: map 
    });
    markerRef.current = marker;

    maps.event.addListener(marker, 'dragend', () => {
      const latlng = marker.getPosition();
      updateFromCoords(latlng.getLat(), latlng.getLng());
    });

    maps.event.addListener(map, 'click', (mouseEvent: any) => {
      const latlng = mouseEvent.latLng;
      marker.setPosition(latlng);
      updateFromCoords(latlng.getLat(), latlng.getLng());
    });
  };

  // 1. Load Kakao Script
  useEffect(() => {
    if (window.kakao?.maps?.services) {
      if (selectedPlace) initMap();
    } else {
      const script = document.createElement('script');
      script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_API_KEY}&libraries=services&autoload=false`;
      script.onload = () => window.kakao.maps.load(() => {
        if (selectedPlace) initMap();
      });
      document.head.appendChild(script);
    }
  }, []);

  // 2. Sync Map with selectedPlace (and init if needed)
  useEffect(() => {
    if (!selectedPlace || !window.kakao?.maps) return;

    if (!mapInstanceRef.current) {
      // Small delay to ensure DOM is ready because of conditional rendering
      const timer = setTimeout(initMap, 50);
      return () => clearTimeout(timer);
    } else {
      const { maps } = window.kakao;
      const pos = new maps.LatLng(selectedPlace.lat, selectedPlace.lng);
      mapInstanceRef.current.setCenter(pos);
      markerRef.current.setPosition(pos);
    }
  }, [selectedPlace]);

  const showStatus = (msg: string, type: 'error' | 'success' | 'info' = 'error') => {
    setStatus({ type, msg });
    setTimeout(() => setStatus(null), 4000);
  };

  const updateFromCoords = (lat: number, lng: number) => {
    if (!window.kakao?.maps?.services) return;
    const geocoder = new window.kakao.maps.services.Geocoder();
    geocoder.coord2Address(lng, lat, (result: any, status: any) => {
      if (status === window.kakao.maps.services.Status.OK) {
        const addr = result[0].road_address ? result[0].road_address.address_name : result[0].address.address_name;
        const newData = { address: addr, lat, lng };
        setSelectedPlace(prev => ({ ...prev, ...newData }));
        onSelect(newData);
      }
    });
  };

  const handleKeywordSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!keyword.trim()) return;

    setIsSearching(true);
    const ps = new window.kakao.maps.services.Places();
    ps.keywordSearch(keyword, (data: any, status: any) => {
      setIsSearching(false);
      if (status === window.kakao.maps.services.Status.OK) {
        setResults(data);
      } else if (status === window.kakao.maps.services.Status.ZERO_RESULT) {
        showStatus('검색 결과가 없습니다.');
        setResults([]);
      } else {
        showStatus('검색 중 오류가 발생했습니다.');
      }
    });
  };

  const selectPlace = (place: any) => {
    const lat = parseFloat(place.y);
    const lng = parseFloat(place.x);
    const newData = { name: place.place_name, address: place.road_address_name || place.address_name, lat, lng };
    setSelectedPlace(newData);
    onSelect(newData);
    setResults([]);
    setKeyword('');
  };

  const openAddressSearch = () => {
    setIsPostcodeOpen(true);
    setResults([]); // Clear other results

    const runSearch = () => {
      if (!postcodeContainerRef.current) return;
      
      // Clear container before embedding
      postcodeContainerRef.current.innerHTML = '';

      new window.daum.Postcode({
        oncomplete: (data: any) => {
          const addr = data.roadAddress || data.jibunAddress;
          const geocoder = new window.kakao.maps.services.Geocoder();
          geocoder.addressSearch(addr, (result: any, status: any) => {
            if (status === window.kakao.maps.services.Status.OK) {
              const lat = parseFloat(result[0].y);
              const lng = parseFloat(result[0].x);
              const newData = { address: addr, lat, lng };
              setSelectedPlace(newData);
              onSelect(newData);
              setIsPostcodeOpen(false);
            }
          });
        },
        width: '100%',
        height: '400px',
      }).embed(postcodeContainerRef.current);
    };

    if (!window.daum?.Postcode) {
      const s = document.createElement('script');
      s.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      s.onload = runSearch;
      document.head.appendChild(s);
    } else {
      // Small timeout to ensure the container is rendered if it was just shown
      setTimeout(runSearch, 0);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return showStatus('이 브라우저는 위치 정보를 지원하지 않습니다.');
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateFromCoords(pos.coords.latitude, pos.coords.longitude);
        setIsLocating(false);
      },
      () => {
        showStatus('위치 정보를 가져오는데 실패했습니다.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };


  return (
    <div style={styles.container}>
      {/* Status Banner */}
      {status && (
        <div style={{
          ...styles.statusBanner,
          background: status.type === 'error' ? '#FEF2F2' : status.type === 'success' ? '#F0FDF4' : '#F1F5F9',
          color: status.type === 'error' ? '#DC2626' : status.type === 'success' ? '#16A34A' : '#475569',
          border: `1.5px solid ${status.type === 'error' ? '#FECACA' : status.type === 'success' ? '#BBF7D0' : '#E2E8F0'}`,
        }}>
          <AlertCircle size={16} />
          {status.msg}
        </div>
      )}

      {/* Search Toggle / Tabs (Simplified) */}
      <div style={styles.inputGroup}>
        <div style={styles.searchBar}>
          <Search size={18} style={styles.searchIcon} />
          <input 
            style={styles.input} 
            placeholder="장소명(상호명) 검색 (예: 멍스팟 카페)" 
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleKeywordSearch()}
          />
          <button type="button" onClick={() => handleKeywordSearch()} style={styles.actionBtn}>검색</button>
        </div>
        
        <div style={styles.secondaryActions}>
          <button type="button" onClick={openAddressSearch} style={styles.utilBtn}>
            <MapPin size={14} /> 주소 검색
          </button>
          <button type="button" onClick={useCurrentLocation} style={{...styles.utilBtn, background: '#7C3AED', color: '#fff'}} disabled={isLocating}>
            {isLocating ? <Loader size={14} className="spin" /> : <Navigation size={14} />} 
            현위치
          </button>
        </div>
      </div>


      {/* Search Results */}
      {results.length > 0 && (
        <div style={styles.resultsPanel}>
          {results.slice(0, 5).map((r, i) => (
            <div key={i} style={styles.resultItem} onClick={() => selectPlace(r)}>
              <div>
                <div style={styles.resultName}>{r.place_name}</div>
                <div style={styles.resultAddr}>{r.road_address_name || r.address_name}</div>
              </div>
              <ChevronRight size={16} color="#94A3B8" />
            </div>
          ))}
          <button type="button" onClick={() => setResults([])} style={styles.closeResults}>닫기</button>
        </div>
      )}

      {/* Address Search Panel (Embedded) */}
      {isPostcodeOpen && (
        <div style={styles.postcodePanel}>
          <div style={styles.postcodeHeader}>
            <span style={{fontWeight: 700, fontSize: '0.9rem'}}>주소 검색</span>
            <button type="button" onClick={() => setIsPostcodeOpen(false)} style={styles.closeBtn}>닫기</button>
          </div>
          <div ref={postcodeContainerRef} style={{ width: '100%', minHeight: '400px' }} />
        </div>
      )}

      {/* Selected Preview & Map */}
      <div style={styles.mapWrapper}>
        {selectedPlace ? (
          <>
            <div style={styles.selectedBanner}>
              <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                <MousePointer2 size={16} color="#FF9F1C" />
                <span style={{fontWeight: 600, fontSize: '0.9rem'}}>
                  {selectedPlace?.name ? `📍 ${selectedPlace.name}` : `📍 ${selectedPlace.address}`}
                </span>
              </div>
              <div style={{fontSize: '0.75rem', color: '#64748B', marginTop: '4px'}}>
                지도를 탭하거나 핀을 움직여 상세 위치를 교정하세요.
              </div>
            </div>
            <div ref={mapContainerRef} style={styles.map} />
          </>
        ) : !isPostcodeOpen ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📍</div>
            <div style={styles.emptyTitle}>장소의 위치를 지정해 주세요</div>
            <div style={styles.emptyDesc}>
              장소명 검색, 주소 검색 또는 '현위치' 버튼을 눌러<br />
              지도에 정확한 위치를 표시할 수 있습니다.
            </div>
          </div>
        ) : null}
      </div>

      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: '16px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '10px' },
  searchBar: { display: 'flex', alignItems: 'center', background: '#F8FAFC', border: '1.5px solid #F1F5F9', borderRadius: '12px', paddingLeft: '12px', overflow: 'hidden' },
  searchIcon: { color: '#94A3B8' },
  input: { flex: 1, border: 'none', padding: '12px', background: 'transparent', outline: 'none', fontSize: '0.92rem' },
  actionBtn: { border: 'none', background: '#2D3142', color: '#fff', padding: '0 20px', height: '48px', fontWeight: 700, cursor: 'pointer' },
  secondaryActions: { display: 'flex', gap: '8px' },
  utilBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600, color: '#64748B', cursor: 'pointer' },
  resultsPanel: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' },
  resultItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', transition: 'background 0.2s' },
  resultName: { fontWeight: 700, fontSize: '0.9rem', color: '#1E293B' },
  resultAddr: { fontSize: '0.78rem', color: '#64748B', marginTop: '2px' },
  closeResults: { width: '100%', padding: '8px', background: '#F8FAFC', border: 'none', fontSize: '0.8rem', color: '#94A3B8', cursor: 'pointer' },
  mapWrapper: { borderRadius: '16px', overflow: 'hidden', border: '1.5px solid #F1F5F9' },
  selectedBanner: { background: '#FFFDF9', borderBottom: '1px solid #FFF1CC', padding: '12px 16px' },
  statusBanner: { padding: '12px 16px', borderRadius: '12px', fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', animation: 'fadeIn 0.3s ease-in-out' },
  map: { width: '100%', height: '320px', animation: 'fadeIn 0.4s ease-out' },
  emptyState: { padding: '60px 20px', textAlign: 'center', background: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' },
  emptyIcon: { fontSize: '2.5rem', marginBottom: '8px', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.05))' },
  emptyTitle: { fontWeight: 700, fontSize: '1rem', color: '#1E293B' },
  emptyDesc: { fontSize: '0.85rem', color: '#94A3B8', lineHeight: 1.6 },
  postcodePanel: { border: '1.5px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', background: '#fff', marginBottom: '12px' },
  postcodeHeader: { padding: '12px 16px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC' },
  closeBtn: { padding: '4px 12px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#64748B', cursor: 'pointer' },
};
