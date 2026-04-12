'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Navigation, MousePointer2, Loader, Link as LinkIcon, AlertCircle, ChevronRight } from 'lucide-react';

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
  const [link, setLink] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<{name?: string, address: string, lat: number, lng: number} | null>(
    initialValue?.lat ? { 
      name: initialValue.name, 
      address: initialValue.address || '', 
      lat: Number(initialValue.lat), 
      lng: Number(initialValue.lng) 
    } : null
  );

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Initialize Kakao Map
  useEffect(() => {
    const loadKakao = () => {
      if (window.kakao?.maps?.services) {
        initMap();
      } else {
        const script = document.createElement('script');
        script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_API_KEY}&libraries=services&autoload=false`;
        script.onload = () => window.kakao.maps.load(initMap);
        document.head.appendChild(script);
      }
    };

    const initMap = () => {
      if (!mapContainerRef.current || !window.kakao?.maps) return;
      
      const { maps } = window.kakao;
      const initialPos = selectedPlace 
        ? new maps.LatLng(selectedPlace.lat, selectedPlace.lng)
        : new maps.LatLng(37.5665, 126.9780); // Seoul center

      const options = { center: initialPos, level: 3 };
      const map = new maps.Map(mapContainerRef.current, options);
      mapInstanceRef.current = map;

      const marker = new maps.Marker({ 
        position: initialPos, 
        draggable: true,
        map: map 
      });
      markerRef.current = marker;

      // Marker drag end
      maps.event.addListener(marker, 'dragend', () => {
        const latlng = marker.getPosition();
        updateFromCoords(latlng.getLat(), latlng.getLng());
      });

      // Map click
      maps.event.addListener(map, 'click', (mouseEvent: any) => {
        const latlng = mouseEvent.latLng;
        marker.setPosition(latlng);
        updateFromCoords(latlng.getLat(), latlng.getLng());
      });
    };

    loadKakao();
  }, []);

  // Update map when selected place changes
  useEffect(() => {
    if (selectedPlace && mapInstanceRef.current && markerRef.current) {
      const { maps } = window.kakao;
      const pos = new maps.LatLng(selectedPlace.lat, selectedPlace.lng);
      mapInstanceRef.current.setCenter(pos);
      markerRef.current.setPosition(pos);
    }
  }, [selectedPlace]);

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
        alert('검색 결과가 없습니다.');
        setResults([]);
      } else {
        alert('검색 중 오류가 발생했습니다.');
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
    const runSearch = () => {
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
            }
          });
        },
      }).open();
    };

    if (!window.daum?.Postcode) {
      const s = document.createElement('script');
      s.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      s.onload = runSearch;
      document.head.appendChild(s);
    } else runSearch();
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return alert('위치 정보를 지원하지 않습니다.');
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateFromCoords(pos.coords.latitude, pos.coords.longitude);
        setIsLocating(false);
      },
      () => {
        alert('위치 정보를 가져오는데 실패했습니다.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  const handleLinkExtract = async () => {
    if (!link.trim()) return;
    setIsExtracting(true);
    try {
      const res = await fetch(`/api/extract-metadata?url=${encodeURIComponent(link)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      // Try to search for this place by name to get coordinates
      if (data.title) {
        setKeyword(data.title);
        const ps = new window.kakao.maps.services.Places();
        ps.keywordSearch(data.title, (results: any, status: any) => {
          if (status === window.kakao.maps.services.Status.OK) {
            setResults(results);
          } else {
            alert(`'${data.title}' 장소를 찾았습니다. 리스트에서 선택해 주세요.`);
          }
        });
      }
    } catch (err: any) {
      alert('링크 정보를 읽어오는데 실패했습니다. 상호명을 직접 검색해 주세요.');
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div style={styles.container}>
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

      {/* Link Auto-fill Section */}
      <div style={styles.linkSection}>
        <div style={styles.linkHeader}>
          <LinkIcon size={14} /> Naver/Kakao 지도 링크로 자동 입력
        </div>
        <div style={styles.searchBar}>
          <input 
            style={{...styles.input, fontSize: '0.85rem'}} 
            placeholder="공유받은 지도 링크를 붙여넣으세요" 
            value={link}
            onChange={e => setLink(e.target.value)}
          />
          <button type="button" onClick={handleLinkExtract} style={{...styles.actionBtn, background: '#4B5563'}} disabled={isExtracting}>
            {isExtracting ? <Loader size={14} className="spin" /> : '불러오기'}
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

      {/* Selected Preview & Map */}
      <div style={styles.mapWrapper}>
        <div style={styles.selectedBanner}>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <MousePointer2 size={16} color="#FF9F1C" />
            <span style={{fontWeight: 600, fontSize: '0.9rem'}}>
              {selectedPlace?.name ? `📍 ${selectedPlace.name}` : selectedPlace?.address ? `📍 ${selectedPlace.address}` : '위치를 지정해 주세요'}
            </span>
          </div>
          <div style={{fontSize: '0.75rem', color: '#64748B', marginTop: '4px'}}>
            지도를 탭하거나 핀을 움직여 상세 위치를 교정하세요.
          </div>
        </div>
        <div ref={mapContainerRef} style={styles.map} />
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
  linkSection: { background: '#F1F5F9', padding: '12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' },
  linkHeader: { fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' },
  resultsPanel: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' },
  resultItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', transition: 'background 0.2s' },
  resultName: { fontWeight: 700, fontSize: '0.9rem', color: '#1E293B' },
  resultAddr: { fontSize: '0.78rem', color: '#64748B', marginTop: '2px' },
  closeResults: { width: '100%', padding: '8px', background: '#F8FAFC', border: 'none', fontSize: '0.8rem', color: '#94A3B8', cursor: 'pointer' },
  mapWrapper: { borderRadius: '16px', overflow: 'hidden', border: '1.5px solid #F1F5F9' },
  selectedBanner: { background: '#FFFDF9', borderBottom: '1px solid #FFF1CC', padding: '12px 16px' },
  map: { width: '100%', height: '280px' },
};
