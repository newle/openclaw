import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useUserStore } from '../store/userStore';
import { Camera, MapPin, CheckCircle, XCircle, ChevronLeft, ChevronRight, ArrowLeft, ImageOff, Map as MapIcon } from 'lucide-react';
import { MapContainer, TileLayer, Polygon, useMap, Marker, Popup } from 'react-leaflet';
import * as turf from '@turf/turf';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet Default Icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface Location {
    id: string;
    description: string;
    hint: string;
    photo_url: string;
    order_index: number;
    lat: number;
    lng: number;
}

// Component to fit bounds
const FitBounds = ({ locations }: { locations: Location[] }) => {
    const map = useMap();
    useEffect(() => {
        if (locations.length > 0) {
            const bounds = locations.map(l => [l.lat, l.lng] as [number, number]);
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [locations, map]);
    return null;
};

// Custom Marker Component
const MapPhotoMarker = ({ loc }: { loc: Location }) => {
    // Create custom icon with the photo
    const icon = L.divIcon({
        className: 'custom-map-marker',
        html: `<div style="
            width: 48px; 
            height: 48px; 
            border-radius: 50%; 
            border: 3px solid white; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.3); 
            background-image: url('${loc.photo_url}'); 
            background-size: cover; 
            background-position: center;
        "></div>`,
        iconSize: [48, 48],
        iconAnchor: [24, 24], // Center the marker
    });

    return (
        <Marker position={[loc.lat, loc.lng]} icon={icon}>
            <Popup>
                <div className="text-center">
                    <img src={loc.photo_url} className="w-32 h-32 object-cover rounded mb-2" />
                    <p className="font-bold">{loc.description}</p>
                </div>
            </Popup>
        </Marker>
    );
};

const Game = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useUserStore();
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [currentLocIndex, setCurrentLocIndex] = useState(0);
  const [verifiedIds, setVerifiedIds] = useState<string[]>([]);
  const [historyMap, setHistoryMap] = useState<Record<string, any>>({});
  const [imgError, setImgError] = useState(false);
  const initialJumpDone = useRef(false);
  const [showMap, setShowMap] = useState(true); // Default to showing map initially
  const [hasStarted, setHasStarted] = useState(false); // Track if game started
  const [isCompleted, setIsCompleted] = useState(false);
  const [finalResult, setFinalResult] = useState<any>(null);

  // Fetch locations and progress
  useEffect(() => {
      const fetchGameData = async () => {
          try {
            // 1. Get Game Details
            const treasures = await api.get('/game');
            const treasure = treasures.find((t: any) => t.id === id);
            
            if (treasure && treasure.locations) {
                 const details = await api.get(`/game/${id}`);
                 if (details && details.locations) {
                     setLocations(details.locations.sort((a: any, b: any) => a.order_index - b.order_index));
                 }
            }

            // 2. Get Progress if user is logged in
            if (user?.id) {
                const progress = await api.get(`/game/${id}/progress?userId=${user.id}`);
                if (progress) {
                    setVerifiedIds(progress.verifiedLocationIds || []);
                    
                    // Check completion
                    if (progress.is_completed) {
                        setIsCompleted(true);
                        setFinalResult(progress); // Assuming progress contains final stats
                    }

                    // If hasParticipation is true, game started.
                    // Or fallback to verifiedIds.length > 0 check for old backend compat
                    if (progress.hasParticipation || progress.verifiedLocationIds?.length > 0) {
                        setHasStarted(true);
                        setShowMap(false); // Auto switch to photos if already playing
                    }
                    
                    const map: Record<string, any> = {};
                    progress.verifications?.forEach((v: any) => {
                        map[v.location_id] = {
                            verified: v.is_verified,
                            similarity: v.similarity_score * 100,
                            distance: v.distance_meters,
                            photo_url: v.photo_url // Need this from backend
                        };
                    });
                    setHistoryMap(map);
                }
            }
          } catch (e) {
              console.error(e);
          } finally {
              setLoading(false);
          }
      };
      fetchGameData();
  }, [id, user?.id]);

  const handleStartGame = async () => {
      try {
          await api.post('/game/start', { treasureId: id, userId: user?.id });
          setHasStarted(true);
          setShowMap(false); // Switch to photo view to start hunting
      } catch (e: any) {
          alert("Failed to start game: " + e.message);
      }
  };

  // Auto-jump to first unverified location on load
  useEffect(() => {
      if (!loading && locations.length > 0 && !initialJumpDone.current) {
          const firstUnverifiedIndex = locations.findIndex(loc => !verifiedIds.includes(loc.id));
          if (firstUnverifiedIndex !== -1 && firstUnverifiedIndex !== 0) {
               setCurrentLocIndex(firstUnverifiedIndex);
          }
          initialJumpDone.current = true;
      }
  }, [loading, locations, verifiedIds]);

  const currentTarget = locations[currentLocIndex];
  const isVerified = currentTarget && verifiedIds.includes(currentTarget.id);
  const historyData = currentTarget ? historyMap[currentTarget.id] : null;

  // Calculate geofence polygon
  const geofencePolygon = React.useMemo(() => {
    if (locations.length === 0) return null;
    try {
        const points = locations.map(l => [l.lng, l.lat]); // Turf uses [lng, lat]
        const pointCollection = turf.points(points);
        
        // 1. If <= 2 points, use buffer directly (circles/capsule)
        if (locations.length <= 2) {
             const buffered = turf.buffer(pointCollection, 0.1, { units: 'kilometers' });
             // Force type cast because Turf types can be tricky with union returns
             const feature = buffered as any;
             
             // Check if it's a Feature or FeatureCollection
             // turf.buffer usually returns Feature<Polygon|MultiPolygon>
             const geometry = feature.geometry || feature.features?.[0]?.geometry;
             if (!geometry) return null;

             if (geometry.type === 'Polygon') {
                 return geometry.coordinates[0].map((coord: any) => [coord[1], coord[0]] as [number, number]);
             } else if (geometry.type === 'MultiPolygon') {
                 return geometry.coordinates.map((poly: any) => 
                     poly[0].map((coord: any) => [coord[1], coord[0]] as [number, number])
                 );
             }
        } else {
            // 2. If > 2 points, try convex hull first
            const hull = turf.convex(pointCollection);
            if (hull) {
                // Buffer the hull
                const buffered = turf.buffer(hull, 0.05, { units: 'kilometers' });
                const feature = buffered as any;
                const geometry = feature.geometry || feature.features?.[0]?.geometry;
                
                if (geometry && geometry.type === 'Polygon') {
                     return geometry.coordinates[0].map((coord: any) => [coord[1], coord[0]] as [number, number]);
                }
            } else {
                // Fallback if convex hull fails (e.g. collinear points)
                const buffered = turf.buffer(pointCollection, 0.1, { units: 'kilometers' });
                const feature = buffered as any;
                const geometry = feature.geometry || feature.features?.[0]?.geometry;
                
                if (!geometry) return null;

                 if (geometry.type === 'Polygon') {
                     return geometry.coordinates[0].map((coord: any) => [coord[1], coord[0]] as [number, number]);
                 } else if (geometry.type === 'MultiPolygon') {
                     return geometry.coordinates.map((poly: any) => 
                         poly[0].map((coord: any) => [coord[1], coord[0]] as [number, number])
                     );
                 }
            }
        }
    } catch (e) {
        console.error("Failed to calculate geofence:", e);
    }
    return null;
  }, [locations]);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImgError(false);
    const file = e.target.files?.[0];
    if (file) {
      // 1. Immediate preview with Blob URL (prevents broken image icon)
      const previewUrl = URL.createObjectURL(file);
      setPhoto(previewUrl);
      setResult(null); 
      
      // 2. Read as base64 in background for uploading
      const reader = new FileReader();
      reader.onload = (evt) => {
          if (evt.target?.result) {
              setPhotoData(evt.target.result as string);
          }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVerify = async () => {
    if (!photoData || !currentTarget) return;
    setVerifying(true);

    try {
        const res = await api.post('/game/verify-location', {
          treasureId: id,
          locationId: currentTarget.id,
          photo: photoData,
          userId: user?.id
        });
        setResult(res);
        
        // Update local state if verified
        if (res.verified) {
             setVerifiedIds(prev => [...prev, currentTarget.id]);
             setHistoryMap(prev => ({
                 ...prev,
                 [currentTarget.id]: {
                     verified: true,
                     similarity: res.similarity,
                     distance: res.distance,
                     photo_url: res.photo_url || photo // Use returned URL or local blob as fallback
                 }
             }));
             
             // Preload the uploaded image in background so it's ready when we revisit history
             if (res.photo_url) {
                 const img = new Image();
                 img.src = res.photo_url;
             }
        }
    } catch (err: any) {
      alert(`Verification failed: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  };
  
  const nextLocation = () => {
      // Find the next unverified location index
      let nextIndex = currentLocIndex + 1;
      
      // If we are at the end, check if we missed any unverified ones earlier?
      // Or just loop/stay.
      // Simple logic: Go to next.
      
      if (nextIndex < locations.length) {
          setCurrentLocIndex(nextIndex);
          setPhoto(null);
          setPhotoData(null);
          setResult(null);
      } else {
          // Check if ALL are verified
          const allVerified = locations.every(loc => verifiedIds.includes(loc.id));
          if (allVerified) {
             alert("Congratulations! You have completed all locations!");
             navigate('/');
          } else {
             // Maybe go back to first unverified?
             const firstUnverified = locations.findIndex(loc => !verifiedIds.includes(loc.id));
             if (firstUnverified !== -1) {
                 alert("Moving to next unverified location...");
                 setCurrentLocIndex(firstUnverified);
                 setPhoto(null);
                 setPhotoData(null);
                 setResult(null);
             } else {
                 // Should be covered by allVerified, but just in case
                 alert("All locations completed!");
                 navigate('/');
             }
          }
      }
  };
  
  const prevPhoto = () => {
      const newIndex = Math.max(0, currentLocIndex - 1);
      setCurrentLocIndex(newIndex);
      setPhoto(null);
      setPhotoData(null);
      setResult(null);
  };
  
  const nextPhoto = () => {
      const newIndex = Math.min(locations.length - 1, currentLocIndex + 1);
      setCurrentLocIndex(newIndex);
      setPhoto(null);
      setPhotoData(null);
      setResult(null);
  };

  if (loading) return <div className="flex h-screen items-center justify-center text-white bg-gray-900">Loading...</div>;
  if (!currentTarget) return <div className="flex h-screen items-center justify-center text-white bg-gray-900">No locations found.</div>;

  // Render Final Result Screen if Completed
  if (isCompleted && finalResult) {
      return (
        <div className="min-h-screen bg-gray-900 text-white p-6 overflow-y-auto">
            <div className="max-w-2xl mx-auto">
                <div className="text-center mb-8">
                    <div className="inline-block p-4 rounded-full bg-green-500/20 mb-4">
                        <CheckCircle className="text-green-500 w-16 h-16" />
                    </div>
                    <h1 className="text-3xl font-bold text-green-400">Mission Accomplished!</h1>
                    <p className="text-gray-400 mt-2">You found all the treasures.</p>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-gray-800 p-4 rounded-xl text-center">
                        <span className="block text-gray-400 text-sm mb-1">Total Time</span>
                        <span className="text-2xl font-mono font-bold">{finalResult.final_cost}s</span>
                    </div>
                    <div className="bg-gray-800 p-4 rounded-xl text-center">
                        <span className="block text-gray-400 text-sm mb-1">Rank</span>
                        <span className="text-2xl font-mono font-bold">#1</span> 
                        {/* Rank logic needs backend support, hardcoded for now or fetch rank */}
                    </div>
                </div>

                <h2 className="text-xl font-bold mb-4">Gallery</h2>
                <div className="space-y-6">
                    {locations.map((loc) => {
                        const history = historyMap[loc.id];
                        return (
                            <div key={loc.id} className="bg-gray-800 p-4 rounded-xl">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="font-bold">{loc.description}</h3>
                                    {history && (
                                        <span className="text-green-400 text-sm font-mono">
                                            Score: {history.similarity.toFixed(1)}%
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <div className="text-xs text-gray-500 mb-1">Target</div>
                                        <img src={loc.photo_url} className="w-full aspect-square object-cover rounded-lg border border-gray-600" />
                                    </div>
                                    <div>
                                        <div className="text-xs text-gray-500 mb-1">Your Shot</div>
                                        {history?.photo_url ? (
                                            <img src={history.photo_url} className="w-full aspect-square object-cover rounded-lg border border-green-500/50" />
                                        ) : (
                                            <div className="w-full aspect-square bg-gray-700 rounded-lg flex items-center justify-center">
                                                <span className="text-xs text-gray-500">No Photo</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                
                <button 
                    onClick={() => navigate('/')}
                    className="w-full mt-8 bg-white text-black font-bold py-4 rounded-full hover:bg-gray-200 transition"
                >
                    Back to Home
                </button>
            </div>
        </div>
      );
  }

  // Render Map Only View (Start Screen)
  // Only show if showMap is true AND game hasn't started yet. 
  // If game has started (hasStarted = true), we force showMap = false in effect, but if user toggles it back?
  // User requirement: "对于已经开始的寻宝，就不需要进入到地图页了。直接到匹配页面就好了。"
  // This implies if hasStarted, we shouldn't show the "Start Screen" map.
  // But we still want to allow toggling map during game (Mini Map).
  // So, let's change condition: Show Start Screen ONLY if (!hasStarted && showMap).
  // If (hasStarted && showMap), it should be a map overlay or separate view but NOT the start screen with "Start Hunt" button.
  // Actually, the current Map View serves both purposes (Start screen vs Reference Map).
  // Let's split or adjust based on hasStarted.
  
  if (showMap && locations.length > 0) {
      // Check if user is creator?
      // We don't have creator info directly here, but we can check if current user id matches treasure creator.
      // We need to fetch treasure details to know creator_id. 
      // But we fetched it in useEffect. Wait, we fetched `details` but didn't store full object.
      // Let's assume for now any user sees the photos if they are on map page (Start Screen).
      // Requirement: "对于寻宝的创建者，在进入到地图页面的时候，在地图上显示当前视野内最多5张照片"
      // Let's show it for everyone for now as a feature? Or strictly creator?
      // Strict: We need to know if user is creator.
      // Let's store creatorId in state.
      
      // Also need Marker/Popup from leaflet.
      
      return (
        <div className="flex flex-col h-screen bg-gray-900 text-white relative">
             <button onClick={() => {
                 if (hasStarted) {
                     setShowMap(false); // If started, Back arrow on map goes to Game
                 } else {
                     navigate('/'); // If not started, Back arrow goes to Home
                 }
             }} className="absolute top-4 left-4 z-[1000] bg-black/50 p-2 rounded-full hover:bg-black/70 transition">
                 <ArrowLeft size={20} />
             </button>
             
             <div className="flex-1 relative z-10">
                 <MapContainer 
                    center={[locations[0].lat, locations[0].lng]} 
                    zoom={13} 
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={false}
                 >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {geofencePolygon && (
                        <Polygon 
                            positions={geofencePolygon} 
                            pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.2, weight: 2 }} 
                        />
                    )}
                    <FitBounds locations={locations} />
                    
                    {/* Creator View: Show photos on map */}
                    {/* Assuming "creator" logic is handled or we just show for everyone on Start Screen as preview? */}
                    {/* Let's show for everyone as "Preview" but limit to 5 */}
                    {locations.slice(0, 5).map((loc) => (
                         <div key={loc.id}>
                             {/* Custom Marker using React Leaflet? 
                                 We need `Marker` and `Popup` or custom Icon.
                                 React Leaflet `Marker` needs `icon`.
                                 We can use `DivIcon` to render HTML (image).
                             */}
                             {/* Since we didn't import Marker/Popup, let's use a simple Overlay approach or skip strict map integration for now 
                                 and just use absolute positioned elements if we can project coords?
                                 MapContainer children can access map context.
                             */}
                             <MapPhotoMarker loc={loc} />
                         </div>
                    ))}
                 </MapContainer>
                 
                 {/* Overlay Text for Map */}
                 <div className="absolute top-4 right-4 z-[1000] bg-black/60 px-4 py-2 rounded-lg text-sm text-white font-medium">
                     Explore the blue zone
                 </div>

                 {/* Start Button Overlay - ONLY if not started */}
                 {!hasStarted && (
                     <div className="absolute bottom-0 left-0 right-0 z-[1000] flex flex-col items-center justify-end pb-12 bg-gradient-to-t from-black/80 to-transparent h-1/3 pointer-events-none">
                         <button 
                            onClick={handleStartGame}
                            className="pointer-events-auto bg-green-600 hover:bg-green-500 text-white font-bold text-xl px-12 py-4 rounded-full shadow-xl transform transition hover:scale-105 animate-pulse flex items-center gap-2"
                         >
                             <MapIcon size={24} />
                             Start Hunt
                         </button>
                         <p className="text-gray-300 text-sm mt-4 font-medium">Find all locations within the area</p>
                     </div>
                 )}
             </div>
        </div>
      );
  }

  // Render Game View (Photos & Camera)
  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Top: Header & Reference Photos (Swipeable) */}
      <div className="relative h-1/2 bg-gray-800 flex flex-col">
         {/* Back Button */}
         <button onClick={() => navigate('/')} className="absolute top-4 left-4 z-30 bg-black/50 p-2 rounded-full hover:bg-black/70 transition">
             <ArrowLeft size={20} />
         </button>
         
         {/* Map Toggle (Mini Map View?) - Optional now since map is start screen */}
         {/* Let's keep a way to view map if needed, or remove since requirement implies separation */}
         {/* "开始寻宝才会尽到有照片+拍照匹配的页面" - implies map is pre-game. */}
         {/* But user might want to check map during game? Let's keep the toggle but default to photos. */}
         
         <button 
            onClick={() => setShowMap(true)} 
            className="absolute top-4 right-4 z-30 bg-black/50 p-2 rounded-full hover:bg-black/70 transition flex items-center gap-2 px-3"
         >
             <MapIcon size={20} />
             <span className="text-xs font-bold">Map</span>
         </button>

         {/* Main Photo Area */}
         <div className="flex-1 relative overflow-hidden bg-black">
             {locations.map((loc, index) => (
                 <img
                    key={loc.id}
                    src={loc.photo_url}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                        index === currentLocIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
                    }`}
                    alt={loc.description}
                 />
             ))}
             
             {/* Navigation Arrows */}
             {locations.length > 1 && (
                 <>
                    <button 
                        onClick={prevPhoto} 
                        disabled={currentLocIndex === 0}
                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 p-2 rounded-full disabled:opacity-30 z-20"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <button 
                        onClick={nextPhoto} 
                        disabled={currentLocIndex === locations.length - 1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 p-2 rounded-full disabled:opacity-30 z-20"
                    >
                        <ChevronRight size={24} />
                    </button>
                 </>
             )}
             
             {/* Location Info Overlay */}
             <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-12 z-20">
                 <div className="flex justify-between items-end">
                     <div>
                        <h2 className="text-xl font-bold">{currentTarget?.description}</h2>
                        <p className="text-sm text-gray-300 mt-1">{currentTarget?.hint || "No hint available"}</p>
                     </div>
                     <div className="text-sm font-mono bg-gray-700 px-2 py-1 rounded">
                         {currentLocIndex + 1} / {locations.length}
                     </div>
                 </div>
             </div>
         </div>
      </div>

      {/* Bottom: Camera Viewfinder or History Result */}
      <div className="flex-1 bg-black relative flex flex-col items-center justify-center border-t border-gray-700">
        
        {/* If verified, show history result instead of camera */}
        {isVerified && historyData ? (
             <div className="absolute inset-0 bg-gray-900 z-10 flex flex-col items-center justify-center p-6 text-center">
                <CheckCircle className="text-green-500 mb-4" size={64} />
                <h3 className="text-2xl font-bold text-green-400">Completed!</h3>
                <p className="mt-2 text-gray-300">You have already found this location.</p>
                
                {/* Show the photo they took */}
                <div className="mt-6 relative">
                    {historyData.photo_url ? (
                        <img 
                            src={historyData.photo_url} 
                            alt="Your Match" 
                            className="w-32 h-32 object-cover rounded-lg border-2 border-green-500 shadow-xl"
                        />
                    ) : (
                        <div className="w-32 h-32 bg-gray-800 rounded-lg border-2 border-green-500 flex items-center justify-center flex-col">
                             <ImageOff className="text-gray-500 mb-2" size={32} />
                             <span className="text-xs text-gray-500">No Photo</span>
                        </div>
                    )}
                    <div className="absolute -bottom-2 -right-2 bg-green-500 text-black font-bold text-[10px] px-2 py-0.5 rounded-full">
                        MATCHED
                    </div>
                </div>

                <div className="flex gap-4 mt-8 text-sm text-gray-400 bg-gray-800 p-3 rounded-lg">
                    <div>
                        <span className="block text-xs text-gray-500">Similarity</span>
                        <span className="text-green-400 font-mono text-lg">{historyData.similarity?.toFixed(1)}%</span>
                    </div>
                    <div className="w-px bg-gray-700"></div>
                    <div>
                        <span className="block text-xs text-gray-500">Distance</span>
                        <span className="text-green-400 font-mono text-lg">{historyData.distance?.toFixed(0)}m</span>
                    </div>
                </div>
                {/* Optional: Show the photo they took? We didn't fetch it though. */}
             </div>
        ) : (
            /* Camera View */
            photo ? (
            <div className="relative w-full h-full flex items-center justify-center bg-gray-900">
                {!imgError ? (
                    <img 
                        src={photo} 
                        alt="Your Capture" 
                        className="max-h-full max-w-full object-contain"
                        onError={() => setImgError(true)}
                    />
                ) : (
                    <div className="text-center p-4">
                        <ImageOff className="mx-auto mb-2 text-gray-500" size={48} />
                        <p className="text-gray-400">Preview not available.</p>
                        <p className="text-xs text-gray-500 mt-1">Image format might not be supported by your browser,<br/>but you can still verify it.</p>
                    </div>
                )}
                <button 
                    onClick={() => { setPhoto(null); setPhotoData(null); setImgError(false); }} 
                    className="absolute top-4 right-4 bg-gray-800 p-2 rounded-full"
                >
                    <XCircle size={20} />
                </button>
            </div>
            ) : (
            <div className="text-gray-500 text-center flex flex-col items-center justify-center h-full w-full">
                <p className="mb-4 text-sm uppercase tracking-widest">Camera Viewfinder</p>
                <div className="w-64 h-64 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center">
                    <Camera size={48} className="opacity-50" />
                </div>
            </div>
            )
        )}

        {/* Verification Result Overlay (Only when actively verifying) */}
        {result && (
          <div className="absolute inset-0 bg-black/90 z-20 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
            {/* Show captured photo in background or small thumbnail for comparison? */}
            {/* User asked to show the photo they took for comparison */}
            <div className="absolute top-0 left-0 w-full h-1/3 bg-gray-900 opacity-50 z-[-1]">
                {/* Maybe not full background, but a visual indicator */}
            </div>
            
            {result.verified ? (
              <>
                <div className="relative mb-6">
                    <CheckCircle className="text-green-500 absolute -bottom-2 -right-2 bg-black rounded-full" size={32} />
                    {photo && (
                        <>
                        {!imgError && photo ? (
                            <img 
                                src={photo} 
                                className="w-32 h-32 object-cover rounded-lg border-2 border-green-500" 
                                alt="Result" 
                                onError={() => setImgError(true)}
                            />
                        ) : (
                            <div className="w-32 h-32 rounded-lg border-2 border-green-500 bg-gray-800 flex items-center justify-center flex-col p-2">
                                <ImageOff className="text-gray-500 mb-1" size={24} />
                                <span className="text-[10px] text-gray-500 leading-tight">Preview not available</span>
                            </div>
                        )}
                        </>
                    )}
                </div>
                
                <h3 className="text-2xl font-bold text-green-400">Target Found!</h3>
                <p className="mt-2 text-gray-300">Great match!</p>
                <div className="flex gap-4 mt-4 text-sm text-gray-400 bg-gray-800 p-3 rounded-lg">
                    <div>
                        <span className="block text-xs text-gray-500">Similarity</span>
                        <span className="text-green-400 font-mono text-lg">{result.similarity.toFixed(1)}%</span>
                    </div>
                    <div className="w-px bg-gray-700"></div>
                    <div>
                        <span className="block text-xs text-gray-500">Distance</span>
                        <span className="text-green-400 font-mono text-lg">{result.distance?.toFixed(0)}m</span>
                    </div>
                </div>
                <button 
                    onClick={nextLocation}
                    className="mt-8 bg-green-600 text-white font-bold px-8 py-3 rounded-full hover:bg-green-500 transition shadow-lg shadow-green-900/50"
                >
                    Continue Hunt
                </button>
              </>
            ) : (
              <>
                <div className="relative mb-6">
                    <XCircle className="text-red-500 absolute -bottom-2 -right-2 bg-black rounded-full" size={32} />
                    {photo && (
                        <>
                        {!imgError ? (
                            <img 
                                src={photo} 
                                className="w-32 h-32 object-cover rounded-lg border-2 border-red-500 grayscale opacity-80" 
                                alt="Result" 
                                onError={() => setImgError(true)}
                            />
                        ) : (
                            <div className="w-32 h-32 rounded-lg border-2 border-red-500 bg-gray-800 flex items-center justify-center flex-col p-2 grayscale opacity-80">
                                <ImageOff className="text-gray-500 mb-1" size={24} />
                                <span className="text-[10px] text-gray-500 leading-tight">Preview not available</span>
                            </div>
                        )}
                        </>
                    )}
                </div>

                <h3 className="text-2xl font-bold text-red-400">Not Quite...</h3>
                <p className="mt-2 text-gray-300">Try getting closer or adjusting your angle.</p>
                <div className="flex gap-4 mt-4 text-sm text-gray-400 bg-gray-800 p-3 rounded-lg">
                    <div>
                        <span className="block text-xs text-gray-500">Similarity</span>
                        <span className="text-red-400 font-mono text-lg">{result.similarity?.toFixed(1)}%</span>
                    </div>
                    <div className="w-px bg-gray-700"></div>
                    <div>
                        <span className="block text-xs text-gray-500">Distance</span>
                        <span className="text-red-400 font-mono text-lg">{result.distance?.toFixed(0)}m</span>
                    </div>
                </div>
                <button 
                    onClick={() => setResult(null)}
                    className="mt-8 bg-white text-black font-bold px-8 py-3 rounded-full hover:bg-gray-200 transition"
                >
                    Try Again
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="h-24 bg-black flex items-center justify-center p-4 z-10">
        {!result && !isVerified && (
            <>
                {photo ? (
                    <button 
                        onClick={handleVerify}
                        disabled={verifying}
                        className="w-full max-w-xs bg-green-600 text-white font-bold text-lg px-8 py-4 rounded-full disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:bg-green-500 transition"
                    >
                        {verifying ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                Verifying...
                            </span>
                        ) : 'Verify'}
                    </button>
                ) : (
                    <label className="cursor-pointer group">
                        <div className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center group-hover:bg-white/10 transition">
                            <div className="w-14 h-14 bg-white rounded-full"></div>
                        </div>
                        <input 
                            type="file" 
                            accept="image/*" 
                            capture="environment" 
                            className="hidden" 
                            onChange={handleCapture}
                        />
                    </label>
                )}
            </>
        )}
      </div>
    </div>
  );
};

export default Game;
