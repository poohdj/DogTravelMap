'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { X, MapPin, Navigation, Share2, Search, Menu, Coffee, TreePine, Map as MapIcon, Utensils, Loader, CheckCircle, AlertCircle, Tag, SlidersHorizontal, List, ChevronRight, Send, ArrowLeft } from 'lucide-react';
import { collection, getDocs, addDoc } from 'firebase/firestore';
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
  facilities?: string[];  // 장소 특징: ["야외/테라스", "전용 주차장"] 등
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

const DOG_CONDITIONS = [
  '오프리쉬(목줄해제) 가능',
  '대형견 입장 가능'
];

const GEAR_REQUIREMENTS = [
  '리드줄만 있으면 OK',
  '슬링백/가방 허용',
  '캐리어(뚜껑 닫힘) 필수',
  '개모차 필수',
  '실내 바닥 보행 금지(안고 있어야 함)'
];

const PLACE_FACILITIES = [
  '야외/테라스',
  '단독룸/프라이빗',
  '베이커리/간단한 식사',
  '전용 주차장'
];

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
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  // 피드백 관련 상태
  const [isFeedbackMode, setIsFeedbackMode] = useState(false);
  const [feedbackType, setFeedbackType] = useState('correction');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  
  // 전역 상태 알림
  const [status, setStatus] = useState<{type: 'error' | 'success' | 'info', msg: string} | null>(null);

  const showStatus = useCallback((msg: string, type: 'error' | 'success' | 'info' = 'error') => {
    setStatus({ type, msg });
    setTimeout(() => setStatus(null), 4000);
  }, []);

  // iPhone Safari Address Bar Color Management
  useEffect(() => {
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    
    if (isFilterOpen) {
      // 필터 열릴 때: 흰색으로 고정 (주소창 색상 고임 방지)
      meta.setAttribute('content', '#ffffff');
    } else {
      // 필터 닫힐 때: 기본 글래스 모디 배경색과 유사하게 리셋
      meta.setAttribute('content', '#f9f9fb');
    }
  }, [isFilterOpen]);
  
  // 개별 필터 상태
  const [conditionsFilter, setConditionsFilter] = useState<string[]>([]);
  const [gearsFilter, setGearsFilter] = useState<string[]>([]);
  const [facilitiesFilter, setFacilitiesFilter] = useState<string[]>([]);
  const [dogFriendlyOnly, setDogFriendlyOnly] = useState(false);

  const activeFilterCount = conditionsFilter.length + gearsFilter.length + facilitiesFilter.length + (dogFriendlyOnly ? 1 : 0);

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
    setIsListViewOpen(false);
    setSearchQuery('');
    if (map) {
      const pos = new window.kakao.maps.LatLng(place.lat, place.lng);
      map.panTo(pos);
      map.setLevel(4);
    }
  };

  const [isListViewOpen, setIsListViewOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // 거리 계산 함수 (Haversine Formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // 지구 반지름 (km)
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // 거리 (km)
  };

  // 0. 필터링 로직 통합 (useMemo로 상시 개수 파악 가능하게 분리)
  const filteredPlaces = useMemo(() => {
    return places.filter((place: Place) => {
      // 1. 카테고리 필터
      if (activeCategory !== '전체' && place.category !== activeCategory) return false;
      
      // 2. 인증된 장소만 보기
      if (dogFriendlyOnly && !place.isDogFriendly) return false;
      
      // 3. 하이브리드 속성 필터
      const placeAllFeatures = [...(place.requirements || []), ...(place.facilities || [])];

      if (conditionsFilter.length > 0) {
        if (!conditionsFilter.every(f => placeAllFeatures.includes(f))) return false;
      }

      if (gearsFilter.length > 0) {
        if (!gearsFilter.some(f => placeAllFeatures.includes(f))) return false;
      }

      if (facilitiesFilter.length > 0) {
        if (!facilitiesFilter.every(f => placeAllFeatures.includes(f))) return false;
      }
      
      return true;
    });
  }, [places, activeCategory, dogFriendlyOnly, conditionsFilter, gearsFilter, facilitiesFilter]);

  // 거리순 정렬된 장소 목록
  const sortedPlaces = useMemo(() => {
    if (!userLocation) return filteredPlaces;
    
    return [...filteredPlaces].map(place => ({
      ...place,
      distance: calculateDistance(userLocation.lat, userLocation.lng, place.lat, place.lng)
    })).sort((a, b) => (a.distance || 0) - (b.distance || 0));
  }, [filteredPlaces, userLocation]);

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
        
        // Explicitly enable interactions for some mobile browsers
        newMap.setDraggable(true);
        newMap.setZoomable(true);
        
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
          const { latitude, longitude } = pos.coords;
          setUserLocation({ lat: latitude, lng: longitude });
          initMap(latitude, longitude, 6);
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

  // 3. Render Markers - 모든 필터 반영
  useEffect(() => {
    if (!map || places.length === 0) return;

    const markers: any[] = [];
    
    // 커스텀 마커 이미지 설정 (주황색 테마 - 4발가락, 시인성 강화)
    const svgIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
        <!-- Orange Pin Shape -->
        <path fill="#FF9F1C" d="M20 38c-0.8 0-11-13-11-22 0-6.1 4.9-11 11-11s11 4.9 11 11c0 9-10.2 22-11 22z"/>
        <!-- White Circle Background for Paw -->
        <circle fill="white" cx="20" cy="16" r="7.5"/>
        <!-- 4-Toe Paw Print in Orange -->
        <g fill="#FF9F1C">
          <ellipse cx="17.5" cy="12.5" rx="1.5" ry="2"/> 
          <ellipse cx="22.5" cy="12.5" rx="1.5" ry="2"/>
          <ellipse cx="14.5" cy="14.5" rx="1.5" ry="2" transform="rotate(-30 14.5 14.5)"/>
          <ellipse cx="25.5" cy="14.5" rx="1.5" ry="2" transform="rotate(30 25.5 14.5)"/>
          <path d="M20 17.5c-2 0-3.8 1.2-3.8 2.8 0 1.2 1.2 2.2 2.5 2.2h2.6c1.3 0 2.5-1 2.5-2.2 0-1.6-1.8-2.8-3.8-2.8z"/>
        </g>
      </svg>
    `;
    const imageSrc = `data:image/svg+xml;base64,${btoa(svgIcon.trim())}`;
    const imageSize = new window.kakao.maps.Size(40, 40);
    const imageOption = { offset: new window.kakao.maps.Point(20, 40) }; 
    const markerImage = new window.kakao.maps.MarkerImage(imageSrc, imageSize, imageOption);

    filteredPlaces.forEach((place: Place) => {
      const position = new window.kakao.maps.LatLng(place.lat, place.lng);
      const marker = new window.kakao.maps.Marker({ 
        position, 
        clickable: true,
        image: markerImage // 커스텀 이미지 적용
      });
      marker.setMap(map);
      markers.push(marker);
      window.kakao.maps.event.addListener(marker, 'click', () => {
        setSelectedPlace(place);
        map.panTo(position);
      });
    });

    // 필터 변경 시 현재 선택된 장소가 필터링되어 사라졌다면 정보창 닫기
    if (selectedPlace) {
      const isStillVisible = filteredPlaces.some((p: Place) => p.id === selectedPlace.id);
      if (!isStillVisible) setSelectedPlace(null);
    }

    return () => { markers.forEach(m => m.setMap(null)); };
  }, [map, filteredPlaces]);

  // 4. Move to my current GPS location
  const goToMyLocation = useCallback(() => {
    if (!map || isLocating) return;
    if (!navigator.geolocation) {
      showStatus('이 브라우저는 내 위치 기능을 지원하지 않습니다.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude }); // 사용자 위치 상태 업데이트
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
      text: `🐾 ${place.name}\n${place.address}${place.addressDetail ? ` (${place.addressDetail})` : ''}\n상태: ${place.isDogFriendly ? '멍스팟 확인완료' : '유저 제안 정보'}`,
      url: `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${place.lat},${place.lng}`,
    };
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
      showStatus('장소 정보가 클립보드에 복사되었습니다!', 'success');
    }
  }, []);

  return (<>
    {/* Status Message Banner */}
    {status && (
      <div style={{
        position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
        zIndex: 3000, padding: '14px 20px', borderRadius: '12px',
        background: status.type === 'error' ? '#FEF2F2' : status.type === 'success' ? '#F0FDF4' : '#EFF6FF',
        color: status.type === 'error' ? '#DC2626' : status.type === 'success' ? '#16A34A' : '#2563EB',
        border: `1.5px solid ${status.type === 'error' ? '#FECACA' : status.type === 'success' ? '#BBF7D0' : '#BFDBFE'}`,
        boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
        display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600, fontSize: '0.9rem',
        animation: 'slideDown 0.3s ease-out'
      }} onClick={() => setStatus(null)}>
        <AlertCircle size={18} />
        {status.msg}
      </div>
    )}

    <main className="map-container">
      {/* Map Rendering Container */}
      <div id="kakao-map" ref={mapRef} tabIndex={0}></div>

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
              className={`header-icon-btn ${isFilterOpen ? 'active' : ''}`}
              onClick={() => { setIsFilterOpen(p => !p); setIsDrawerOpen(false); setIsSearchOpen(false); }}
              aria-label="필터"
              style={{ position: 'relative' }}
            >
              <SlidersHorizontal size={22} />
              {activeFilterCount > 0 && (
                <span className="filter-badge">{activeFilterCount}</span>
              )}
            </button>
            <button
              className={`header-icon-btn ${isDrawerOpen ? 'active' : ''}`}
              onClick={() => { setIsDrawerOpen(p => !p); setIsFilterOpen(false); setIsSearchOpen(false); }}
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
      {(isDrawerOpen || isFilterOpen || isListViewOpen) && (
        <div className="drawer-overlay" onClick={() => { 
          setIsDrawerOpen(false); 
          setIsFilterOpen(false); 
          setIsListViewOpen(false);
        }} />
      )}

      {/* Side Drawer */}
      <div className={`side-drawer ${isDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="brand" style={{ fontSize: '1.1rem' }}>
            <MapIcon size={20} color="var(--primary-color)" /> 멍스팟
          </div>
          <button className="close-btn" onClick={() => setIsDrawerOpen(false)}><X size={20} /></button>
        </div>

        <div className="drawer-divider" />

        <div className="drawer-section">
          <div className="drawer-section-title">서비스 안내</div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            강아지와 함께 갈 수 있는 식당, 카페, 명소를<br />직접 조사하고 사람들과 나누는 지도서비스입니다. 🐾
          </p>
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

      {/* Filter Drawer */}
      <div className={`side-drawer filter-drawer ${isFilterOpen ? 'open' : ''}`}>
        <div className="sheet-handle" />
        <div className="drawer-header">
          <div className="brand" style={{ fontSize: '1.1rem' }}>
            <SlidersHorizontal size={20} color="var(--primary-color)" /> 상세 필터
          </div>
          <button className="close-btn" onClick={() => setIsFilterOpen(false)}><X size={20} /></button>
        </div>

        <div className="drawer-content">
          <div className="drawer-section" style={{ paddingTop: '0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                맞춤형 장소를 찾아보세요
              </div>
              <button 
                onClick={() => {
                  setDogFriendlyOnly(false);
                  setConditionsFilter([]);
                  setGearsFilter([]);
                  setFacilitiesFilter([]);
                }}
                className="reset-btn"
              >
                초기화
              </button>
            </div>
            
            <label className="drawer-toggle-item">
              <div className="toggle-info">
                <CheckCircle size={18} color={dogFriendlyOnly ? 'var(--primary-color)' : '#9094A6'} />
                <span>인증된 장소만 보기</span>
              </div>
              <div className={`toggle-switch ${dogFriendlyOnly ? 'on' : ''}`} onClick={() => setDogFriendlyOnly(p => !p)} />
            </label>
            
            <div className="filter-group">
              <div className="filter-group-title">
                🐾 우리 아이 조건 <span className="logic-badge and">AND</span>
              </div>
              <div className="filter-chips">
                {DOG_CONDITIONS.map(item => (
                  <button key={item}
                    className={`filter-chip ${conditionsFilter.includes(item) ? 'active condition' : ''}`}
                    onClick={() => setConditionsFilter(prev =>
                      prev.includes(item) ? prev.filter(r => r !== item) : [...prev, item]
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <div className="filter-group-title">
                🔖 보호자 준비물 <span className="logic-badge or">OR</span>
              </div>
              <div className="filter-chips">
                {GEAR_REQUIREMENTS.map(item => (
                  <button key={item}
                    className={`filter-chip ${gearsFilter.includes(item) ? 'active gear' : ''}`}
                    onClick={() => setGearsFilter(prev =>
                      prev.includes(item) ? prev.filter(r => r !== item) : [...prev, item]
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group" style={{ marginBottom: '10px' }}>
              <div className="filter-group-title">
                ✨ 장소 및 편의 시설 <span className="logic-badge and">AND</span>
              </div>
              <div className="filter-chips">
                {PLACE_FACILITIES.map(item => (
                  <button key={item}
                    className={`filter-chip ${facilitiesFilter.includes(item) ? 'active facility' : ''}`}
                    onClick={() => setFacilitiesFilter(prev =>
                      prev.includes(item) ? prev.filter(f => f !== item) : [...prev, item]
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="drawer-footer">
          <button className="btn-primary" onClick={() => setIsFilterOpen(false)} style={{ width: '100%' }}>
            {filteredPlaces.length}개의 장소 보기
          </button>
        </div>
      </div>

      {/* List View Drawer */}
      <div className={`side-drawer list-drawer ${isListViewOpen ? 'open' : ''}`}>
        <div className="sheet-handle" />
        <div className="drawer-header">
          <div className="brand" style={{ fontSize: '1.1rem' }}>
            <List size={20} color="var(--primary-color)" /> 장소 목록 ({filteredPlaces.length})
          </div>
          <button className="close-btn" onClick={() => setIsListViewOpen(false)}><X size={20} /></button>
        </div>

        <div className="drawer-content">
          <div className="list-container">
            {sortedPlaces.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                필터에 맞는 장소가 없습니다. 🐾
              </div>
            ) : (
              sortedPlaces.map((place: any) => (
                <div key={place.id} className="list-item-card" onClick={() => { handleSearchSelect(place); setIsListViewOpen(false); }}>
                  <div className="list-item-info">
                    <div className="list-item-category">{place.subCategory || place.category}</div>
                    <div className="list-item-name">{place.name}</div>
                    <div className="list-item-address">{place.address}</div>
                    {place.distance !== undefined && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 700, marginTop: '2px', marginBottom: '6px' }}>
                        현재 위치에서 {place.distance < 1 ? `${Math.round(place.distance * 1000)}m` : `${place.distance.toFixed(1)}km`}
                      </div>
                    )}
                    <div className="list-item-features">
                      {[...(place.requirements || []), ...(place.facilities || [])].slice(0, 3).map(f => (
                        <span key={f} className="feature-dot">{f}</span>
                      ))}
                    </div>
                  </div>
                  <ChevronRight size={18} color="#E5E7EB" />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Floating Action Buttons - Default Map State */}
      {!selectedPlace && (
        <div className="fab-container">
          <button className="fab-btn list-toggle-btn" onClick={() => setIsListViewOpen(true)} title="목록 보기">
            <List size={22} />
          </button>
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
      )}

      {/* Place Info Bottom Sheet */}
      {selectedPlace && (
        <div className="place-info-card">
          {/* FABs attached to the top of the card */}
          <div className="fab-on-card">
            <button className="fab-btn list-toggle-btn" onClick={() => setIsListViewOpen(true)} title="목록 보기">
              <List size={22} />
            </button>
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
              onClick={() => {
                setSelectedPlace(null);
                setIsFeedbackMode(false);
                setFeedbackMessage('');
              }}
              aria-label="닫기"
            >
              <X size={20} />
            </button>
          </div>

          {isFeedbackMode ? (
            <div className="feedback-form" style={{ marginTop: '16px' }}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '10px', color: 'var(--text-main)' }}>어떤 정보가 잘못되었나요?</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'correction', label: '정보 수정' },
                    { id: 'delete', label: '폐업/삭제' },
                    { id: 'other', label: '기타' }
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFeedbackType(t.id)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '10px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        border: '1.5px solid',
                        borderColor: feedbackType === t.id ? 'var(--primary-color)' : '#E2E8F0',
                        background: feedbackType === t.id ? '#FFF4E6' : '#fff',
                        color: feedbackType === t.id ? 'var(--primary-color)' : '#64748B',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '10px', color: 'var(--text-main)' }}>내용</div>
                <textarea
                  placeholder="구체적인 내용을 알려주시면 큰 도움이 됩니다 (예: 현재 강아지 동반이 금지되었습니다 등)"
                  value={feedbackMessage}
                  onChange={(e) => setFeedbackMessage(e.target.value)}
                  style={{
                    width: '100%',
                    height: '100px',
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1.5px solid #E2E8F0',
                    fontSize: '0.9rem',
                    outline: 'none',
                    resize: 'none',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setIsFeedbackMode(false);
                    setFeedbackMessage('');
                  }}
                  style={{ flex: 1, height: '48px' }}
                >
                  <ArrowLeft size={18} /> 이전으로
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={isSubmittingFeedback || !feedbackMessage.trim()}
                  onClick={async () => {
                    if (!feedbackMessage.trim() || !selectedPlace) return;
                    setIsSubmittingFeedback(true);
                    try {
                      await addDoc(collection(db, 'feedbacks'), {
                        placeId: selectedPlace.id,
                        placeName: selectedPlace.name,
                        type: feedbackType,
                        message: feedbackMessage,
                        createdAt: new Date().toISOString(),
                      });
                        showStatus('소중한 피드백이 접수되었습니다. 감사합니다! 🐾', 'success');
                      setIsFeedbackMode(false);
                      setFeedbackMessage('');
                    } catch (err) {
                      console.error('Feedback error:', err);
                      showStatus('이미 정보가 전송되었거나 오류가 발생했습니다.');
                    } finally {
                      setIsSubmittingFeedback(false);
                    }
                  }}
                  style={{ flex: 2, height: '48px' }}
                >
                  {isSubmittingFeedback ? <Loader size={18} className="spin" /> : <Send size={18} />}
                  보내기
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="place-meta">
                <MapPin size={16} />
                <span>{selectedPlace.address}{selectedPlace.addressDetail ? ` (${selectedPlace.addressDetail})` : ''}</span>
              </div>

              {/* 인증 상태 + 필요항목 */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                {selectedPlace.isDogFriendly
                  ? <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 700, color: '#16A34A', background: '#F0FDF4', padding: '4px 12px', borderRadius: '999px', border: '1px solid #BBF7D0' }}>
                    <CheckCircle size={13} /> 멍스팟 확인 완료
                  </span>
                  : <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 700, color: '#6B7280', background: '#F3F4F6', padding: '4px 12px', borderRadius: '999px', border: '1px solid #E5E7EB' }}>
                    <AlertCircle size={13} /> 유저 제안 정보
                  </span>
                }
                
                {(selectedPlace.requirements || []).map(req => {
                  const isAttention = req.includes('입마개');
                  return (
                    <span key={req} style={{ 
                      display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', fontWeight: 700, 
                      color: isAttention ? '#DC2626' : '#4F46E5', 
                      background: isAttention ? '#FEF2F2' : '#EEF2FF', 
                      padding: '4px 12px', borderRadius: '999px', 
                      border: `1px solid ${isAttention ? '#FECACA' : '#C3DAFE'}`
                    }}>
                      {isAttention && <AlertCircle size={13} />}
                      {isAttention ? '주의: ' : '🔖 '}{req}
                    </span>
                  );
                })}
                
                {(selectedPlace.facilities || []).map(fac => (
                  <span key={fac} style={{ fontSize: '0.78rem', fontWeight: 700, color: '#059669', background: '#ECFDF5', padding: '4px 12px', borderRadius: '999px', border: '1px solid #D1FAE5' }}>
                    ✨ {fac}
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
                type="button"
                onClick={() => setIsFeedbackMode(true)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline', padding: '4px 0', marginTop: '4px', fontFamily: 'inherit' }}
              >
                이 정보가 틀렸나요?
              </button>
            </>
          )}
        </div>
      )}
    </main>
  </>);
}
