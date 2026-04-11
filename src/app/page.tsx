'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, MapPin, Navigation, Share2, Search, Menu, Coffee, TreePine, Map as MapIcon, Utensils, Loader } from 'lucide-react';
// import { collection, getDocs } from 'firebase/firestore';
// import { db } from '@/lib/firebase';

// Add type for Kakao Map so typescript doesn't complain
declare global {
  interface Window {
    kakao: any;
  }
}

interface Place {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
}

// Temporary hardcoded data as requested
const MOCK_PLACES: Place[] = [
  {
    id: '1',
    name: '벤지가 편하게 쉬는 카페',
    category: '애견 동반 카페',
    lat: 37.3225, // Ansan area coordinate
    lng: 126.8315,
  },
  {
    id: '2',
    name: '밤콩이 뛰노는 산책로',
    category: '산책로/공원',
    lat: 37.3210, // Ansan area coordinate
    lng: 126.8290,
  }
];

export default function Home() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [isLocating, setIsLocating] = useState(false);
  const myLocationMarkerRef = useRef<any>(null);

  // 1. Fetch places - simulated or real Firestore
  useEffect(() => {
    async function fetchPlaces() {
      try {
        // [TODO] Real DB integration:
        // const querySnapshot = await getDocs(collection(db, 'places'));
        // const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Place[];
        // setPlaces(data);
        
        // For MVP initial rendering: show hardcoded data
        setPlaces(MOCK_PLACES);
      } catch (error) {
        console.error("Error fetching places:", error);
      }
    }
    fetchPlaces();
  }, []);

  // 2. Initialize Kakao Map
  useEffect(() => {
    const initMap = () => {
      if (!mapRef.current) return;
      window.kakao.maps.load(() => {
        const center = new window.kakao.maps.LatLng(37.3218778, 126.8308848);
        const options = {
          center,
          level: 4,
        };
        const newMap = new window.kakao.maps.Map(mapRef.current, options);
        setMap(newMap);
      });
    };

    if (window.kakao && window.kakao.maps) {
      initMap();
    } else {
      const script = document.createElement('script');
      script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_API_KEY}&libraries=services,clusterer&autoload=false`;
      document.head.appendChild(script);
      script.onload = () => initMap();
    }
  }, []);

  // 3. Render Markers when map and places are ready
  useEffect(() => {
    if (!map || places.length === 0) return;

    const markers: any[] = [];

    places.forEach((place) => {
      const position = new window.kakao.maps.LatLng(place.lat, place.lng);
      
      const marker = new window.kakao.maps.Marker({
        position,
        clickable: true
      });

      marker.setMap(map);
      markers.push(marker);

      window.kakao.maps.event.addListener(marker, 'click', () => {
        setSelectedPlace(place);
        map.panTo(position); // Center map to marker
      });
    });

    return () => {
      // Cleanup markers on unmount or updates
      markers.forEach(marker => marker.setMap(null));
    };
  }, [map, places]);

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

        // Remove old my-location marker if exists
        if (myLocationMarkerRef.current) {
          myLocationMarkerRef.current.setMap(null);
        }

        // Add a distinct marker for my location
        const marker = new window.kakao.maps.Marker({
          position: myPos,
          title: '현재 내 위치',
        });
        marker.setMap(map);
        myLocationMarkerRef.current = marker;

        // Smoothly pan map to my location
        map.panTo(myPos);
        map.setLevel(3);

        setIsLocating(false);
      },
      (error) => {
        setIsLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          alert('위치 접근 권한이 거부되었습니다.\n브라우저 주소창 왼쪽의 자물쇠 아이콘을 클릭하여 위치 권한을 허용해 주세요.');
        } else {
          alert('현재 위치를 가져오는 데 실패했습니다. 잠시 후 다시 시도해 주세요.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [map, isLocating]);

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
            <button className="header-icon-btn"><Search size={22} /></button>
            <button className="header-icon-btn"><Menu size={22} /></button>
          </div>
        </div>

        {/* Category Pills */}
        <div className="category-filters">
          <button className="filter-pill active">전체</button>
          <button className="filter-pill"><Coffee size={16} /> 카페</button>
          <button className="filter-pill"><Utensils size={16} /> 식당</button>
          <button className="filter-pill"><TreePine size={16} /> 산책로/명소</button>
        </div>

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
              <span className="place-category">{selectedPlace.category}</span>
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
             <span>안산시 어딘가... (상세주소 연동 필요)</span>
          </div>

          <div className="place-actions">
             <button className="btn-primary">
                <Navigation size={18} />
                길찾기
             </button>
             <button className="btn-secondary">
                <Share2 size={18} />
                공유
             </button>
          </div>
        </div>
      )}
    </main>
  );
}
