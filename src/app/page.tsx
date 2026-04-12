'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, MapPin, Navigation, Share2, Search, Menu, Coffee, TreePine, Map as MapIcon, Utensils, Loader, CheckCircle, AlertCircle, Tag } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Add type for Kakao Map so typescript doesn't complain
declare global {
  interface Window {
    kakao: any;
  }
}

interface Place {
  id: string;
  name: string;
  category: string;       // 대분류: 식당 / 카페 / 명소 / 숙소 / 기타
  subCategory: string;    // 소분류: 한식 / 중식 / 애견카페 / 공원 등
  lat: number;
  lng: number;
  address: string;
  addressDetail?: string; // 상세 주소
  isDogFriendly: boolean; // 애견동반 가능 여부
  requirements: string[]; // 필요 항목: ["견모차", "슬링백"] 등
  notes?: string;         // 기타 메모
}

// 테스트용 샘플 데이터 (Firestore 연동 후 자동으로 교체됨)
const MOCK_PLACES: Place[] = [
  {
    id: '1',
    name: '테스트 애견카페',
    category: '카페',
    subCategory: '애견카페',
    lat: 37.3225,
    lng: 126.8315,
    address: '경기도 안산시 단원구 테스트로 1',
    isDogFriendly: true,
    requirements: [],
    notes: 'Firestore 연동 전 테스트 마커입니다.',
  },
  {
    id: '2',
    name: '테스트 한식당',
    category: '식당',
    subCategory: '한식',
    lat: 37.3210,
    lng: 126.8290,
    address: '경기도 안산시 단원구 테스트로 2',
    isDogFriendly: true,
    requirements: ['견모차'],
    notes: '야외 테라스만 입장 가능.',
  }
];

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  '전체': null,
  '카페': <Coffee size={15} />,
  '식당': <Utensils size={15} />,
  '명소': <TreePine size={15} />,
  '숙소': <MapPin size={15} />,
  '기타': <Menu size={15} />,
};

export default function Home() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('전체');
  const [isLocating, setIsLocating] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [requirementsFilter, setRequirementsFilter] = useState<string[]>([]);
  const [dogFriendlyOnly, setDogFriendlyOnly] = useState(false);
  const myLocationMarkerRef = useRef<any>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchResults = searchQuery.trim().length > 0
    ? places.filter(p =>
      p.name.includes(searchQuery) ||
      p.address?.includes(searchQuery) ||
      p.subCategory?.includes(searchQuery)
    )
    : [];

  const handleSearchSelect = (place: Place) => {
    setSelectedPlace(place);
    setIsSearchOpen(false);
    setSearchQuery('');
    if (map) {
      const pos = new window.kakao.maps.LatLng(place.lat, place.lng);
      map.panTo(pos);
      map.setLevel(4);
    }
  };

  const toggleSearch = () => {
    setIsSearchOpen(prev => {
      if (!prev) setTimeout(() => searchInputRef.current?.focus(), 100);
      return !prev;
    });
    setSearchQuery('');
  };

  // 1. Fetch places from Firestore (falls back to mock data if empty)
  useEffect(() => {
    async function fetchPlaces() {
      try {
        const querySnapshot = await getDocs(collection(db, 'places'));
        if (!querySnapshot.empty) {
          const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Place[];
          setPlaces(data);
        } else {
          // Firestore가 비어있으면 테스트 데이터로 fallback
          console.warn('Firestore에 데이터가 없습니다. 테스트 데이터를 표시합니다.');
          setPlaces(MOCK_PLACES);
        }
      } catch (error) {
        console.error('Error fetching places:', error);
        setPlaces(MOCK_PLACES);
      }
    }
    fetchPlaces();
  }, []);

  // 2. Initialize Kakao Map
  useEffect(() => {
    const initMap = (lat = 37.5666102, lng = 126.9783882, level = 7) => {
      if (!mapRef.current) return;
      window.kakao.maps.load(() => {
        const center = new window.kakao.maps.LatLng(lat, lng);
        const options = { center, level };
        const newMap = new window.kakao.maps.Map(mapRef.current, options);
        setMap(newMap);
      });
    };

    const startWithLocation = () => {
      if (!navigator.geolocation) {
        initMap(); // 위치 불가 → 서울 fallback
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // 위치 성공 → 사용자 위치로 시작
          initMap(pos.coords.latitude, pos.coords.longitude, 6);
        },
        () => {
          // 위치 실패 → 서울 fallback
          initMap();
        },
        { enableHighAccuracy: false, timeout: 5000 }
      );
    };

    if (window.kakao && window.kakao.maps) {
      startWithLocation();
    } else {
      const script = document.createElement('script');
      script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_API_KEY}&libraries=services,clusterer&autoload=false`;
      document.head.appendChild(script);
      script.onload = () => startWithLocation();
    }
  }, []);

  // 3. Render Markers - 카테고리 필터 반영
  useEffect(() => {
    if (!map || places.length === 0) return;

    const markers: any[] = [];
    const filtered = activeCategory === '전체'
      ? places
      : places.filter(p => p.category === activeCategory);

    filtered.forEach((place) => {
      const position = new window.kakao.maps.LatLng(place.lat, place.lng);
      const marker = new window.kakao.maps.Marker({ position, clickable: true });
      marker.setMap(map);
      markers.push(marker);
      window.kakao.maps.event.addListener(marker, 'click', () => {
        setSelectedPlace(place);
        map.panTo(position);
      });
    });

    // 필터 변경 시 선택된 장소가 필터에서 사라지면 닫기
    if (selectedPlace && activeCategory !== '전체' && selectedPlace.category !== activeCategory) {
      setSelectedPlace(null);
    }

    return () => { markers.forEach(m => m.setMap(null)); };
  }, [map, places, activeCategory]);

  // 4. Move to my current GPS location
  const goToMyLocation = useCallback(() => {
    if (!map || isLocating) return;
    if (!navigator.geolocation) {
      alert('이 브라우저는 내 위치 기능을 지원하지 않습니다.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const myPos = new window.kakao.maps.LatLng(latitude, longitude);
        if (myLocationMarkerRef.current) myLocationMarkerRef.current.setMap(null);
        const marker = new window.kakao.maps.Marker({ position: myPos, title: '현재 내 위치' });
        marker.setMap(map);
        myLocationMarkerRef.current = marker;
        map.panTo(myPos);
        map.setLevel(3);
        setIsLocating(false);
      },
      () => { setIsLocating(false); },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, [map, isLocating]);

  // 5. 길찾기 (카카오맵 길찾기 연동)
  const openDirections = useCallback((place: Place) => {
    const url = `https://map.kakao.com/link/to/${encodeURIComponent(place.name)},${place.lat},${place.lng}`;
    window.open(url, '_blank');
  }, []);

  // 6. 공유하기 (Web Share API → 클립보드 fallback)
  const sharePlace = useCallback(async (place: Place) => {
    const shareData = {
      title: `멍스팟 - ${place.name}`,
      text: `🐾 ${place.name}\n${place.address}${place.addressDetail ? ` (${place.addressDetail})` : ''}\n애견동반: ${place.isDogFriendly ? '가능' : '확인필요'}`,
      url: `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${place.lat},${place.lng}`,
    };
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
      alert('장소 정보가 클립보드에 복사되었습니다!');
    }
  }, []);

  return (
    <main className="map-container">
      {/* Map Rendering Container */}
      <div id="kakao-map" ref={mapRef}></div>

      {/* UI Overlay Layer (Header + Categories + FAB) */}
      <div className="ui-layer">

        {/* Top Header */}
        <div className="top-header">
          <div className="brand">
            <MapIcon size={24} color="var(--primary-color)" />
            멍스팟
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`header-icon-btn ${isSearchOpen ? 'active' : ''}`}
              onClick={toggleSearch}
              aria-label="검색"
            >
              {isSearchOpen ? <X size={22} /> : <Search size={22} />}
            </button>
            <button
              className={`header-icon-btn ${isDrawerOpen ? 'active' : ''}`}
              onClick={() => { setIsDrawerOpen(p => !p); setIsSearchOpen(false); }}
              aria-label="메뉴"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>

        {/* Search Panel - 슬라이드 다운 */}
        {isSearchOpen && (
          <div className="search-panel">
            <div className="search-input-wrap">
              <Search size={18} color="var(--text-secondary)" />
              <input
                ref={searchInputRef}
                className="search-input"
                type="text"
                placeholder="장소명, 주소, 소분류 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
                  <X size={16} />
                </button>
              )}
            </div>
            {searchResults.length > 0 && (
              <ul className="search-results">
                {searchResults.map(place => (
                  <li key={place.id} className="search-result-item" onClick={() => handleSearchSelect(place)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ background: '#FFF4E6', borderRadius: '8px', padding: '6px', color: 'var(--primary-color)', flexShrink: 0 }}>
                        <MapPin size={16} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-main)' }}>{place.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {place.category} · {place.subCategory} · {place.address} {place.addressDetail && `(${place.addressDetail})`}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {searchQuery.trim().length > 0 && searchResults.length === 0 && (
              <div style={{ padding: '16px 20px', color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center' }}>
                "지역, 업종, 장소명"으로 검색해보세요.
              </div>
            )}
          </div>
        )}

        {/* Category Pills - 실제 필터 동작 */}
        <div className="category-filters">
          {Object.keys(CATEGORY_ICONS).map(cat => (
            <button
              key={cat}
              className={`filter-pill ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {CATEGORY_ICONS[cat]} {cat}
            </button>
          ))}
        </div>

      </div>

      {/* Side Drawer Overlay */}
      {isDrawerOpen && (
        <div className="drawer-overlay" onClick={() => setIsDrawerOpen(false)} />
      )}

      {/* Side Drawer */}
      <div className={`side-drawer ${isDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="brand" style={{ fontSize: '1.1rem' }}>
            <MapIcon size={20} color="var(--primary-color)" /> 멍스팟
          </div>
          <button className="close-btn" onClick={() => setIsDrawerOpen(false)}><X size={20} /></button>
        </div>

        <p style={{ padding: '0 20px 16px', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          강아지와 함께 갈 수 있는 식당, 카페, 명소를<br />직접 조사하고 사람들과 나누는 지도서비스입니다. 🐾
        </p>

        <div className="drawer-divider" />

        {/* 상세 필터 */}
        <div className="drawer-section">
          <div className="drawer-section-title">상세 필터</div>
          <label className="drawer-toggle">
            <span>애견동반 가능만 보기</span>
            <div className={`toggle-switch ${dogFriendlyOnly ? 'on' : ''}`} onClick={() => setDogFriendlyOnly(p => !p)} />
          </label>
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>필요 항목 필터</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {['견모차', '슬링백', '캐리어', '입마개', '리드줄 필수'].map(req => (
                <button key={req}
                  onClick={() => setRequirementsFilter(prev =>
                    prev.includes(req) ? prev.filter(r => r !== req) : [...prev, req]
                  )}
                  style={{
                    padding: '6px 12px', borderRadius: '999px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                    background: requirementsFilter.includes(req) ? '#7C3AED' : '#F4F5F7',
                    color: requirementsFilter.includes(req) ? '#fff' : 'var(--text-secondary)',
                    border: 'none', fontFamily: 'inherit',
                  }}
                >🐾 {req}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="drawer-divider" />

        <a href="/suggest" className="drawer-action-btn">
          <span style={{ fontSize: '1.4rem' }}>➕</span>
          <div>
            <div style={{ fontWeight: 700 }}>장소 등록 제안하기</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>내가 아는 애견 동반 장소를 제안해 주세요</div>
          </div>
        </a>

        <a href="mailto:mungspot.com@gmail.com" className="drawer-action-btn">
          <span style={{ fontSize: '1.4rem' }}>📬</span>
          <div>
            <div style={{ fontWeight: 700 }}>오류 신고 / 문의</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>mungspot.com@gmail.com</div>
          </div>
        </a>
      </div>

      {/* Floating Action Buttons */}
      <div className={`fab-container ${selectedPlace ? 'sheet-open' : ''}`}>
        <button
          className="fab-btn"
          aria-label="내 위치로 이동"
          onClick={goToMyLocation}
          disabled={isLocating}
          style={{ color: isLocating ? 'var(--primary-color)' : 'var(--text-main)' }}
        >
          {isLocating
            ? <Loader size={22} style={{ animation: 'spin 1s linear infinite' }} />
            : <Navigation size={22} />}
        </button>
      </div>

      {/* Place Info Bottom Sheet */}
      {selectedPlace && (
        <div className="place-info-card">
          <div className="sheet-handle"></div>

          <div className="place-header">
            <div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <span className="place-category">{selectedPlace.category}</span>
                <span className="place-category" style={{ background: '#EEF2FF', color: '#4F46E5' }}>
                  <Tag size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />
                  {selectedPlace.subCategory}
                </span>
              </div>
              <h2 className="place-title">{selectedPlace.name}</h2>
            </div>
            <button
              className="close-btn"
              onClick={() => setSelectedPlace(null)}
              aria-label="닫기"
            >
              <X size={20} />
            </button>
          </div>

          <div className="place-meta">
            <MapPin size={16} />
            <span>{selectedPlace.address}{selectedPlace.addressDetail ? ` (${selectedPlace.addressDetail})` : ''}</span>
          </div>

          {/* 애견동반 여부 + 필요항목 */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {selectedPlace.isDogFriendly
              ? <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, color: '#16A34A', background: '#F0FDF4', padding: '4px 10px', borderRadius: '999px' }}>
                <CheckCircle size={13} /> 애견동반 가능
              </span>
              : <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, color: '#DC2626', background: '#FFF5F5', padding: '4px 10px', borderRadius: '999px' }}>
                <AlertCircle size={13} /> 동반 여부 확인 필요
              </span>
            }
            {selectedPlace.requirements?.map(req => (
              <span key={req} style={{ fontSize: '0.78rem', fontWeight: 600, color: '#7C3AED', background: '#F5F3FF', padding: '4px 10px', borderRadius: '999px' }}>
                🐾 {req} 필요
              </span>
            ))}
          </div>

          {selectedPlace.notes && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.5 }}>
              {selectedPlace.notes}
            </p>
          )}

          <div className="place-actions">
            <button className="btn-primary" onClick={() => openDirections(selectedPlace)}>
              <Navigation size={18} />
              길찾기
            </button>
            <button className="btn-secondary" onClick={() => sharePlace(selectedPlace)}>
              <Share2 size={18} />
              공유
            </button>
          </div>

          {/* 피드백 */}
          <button
            onClick={() => {
              const type = prompt('피드백 유형을 입력하세요:\n1. 정보 수정 요청\n2. 폐업·삭제 요청\n3. 기타');
              if (!type) return;
              const typeMap: Record<string, string> = { '1': 'correction', '2': 'delete', '3': 'other' };
              const message = prompt('자세한 내용을 입력해 주세요:');
              if (!message) return;
              import('firebase/firestore').then(({ addDoc, collection }) => {
                addDoc(collection(db, 'feedbacks'), {
                  placeId: selectedPlace.id,
                  placeName: selectedPlace.name,
                  type: typeMap[type] || 'other',
                  message,
                  createdAt: new Date().toISOString(),
                }).then(() => alert('피드백이 접수되었습니다. 감사합니다! 🐾'));
              });
            }}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline', padding: '4px 0', marginTop: '4px', fontFamily: 'inherit' }}
          >
            이 정보가 틀렸나요?
          </button>
        </div>
      )}
    </main>
  );
}
