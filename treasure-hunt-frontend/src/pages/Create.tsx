import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useUserStore } from '../store/userStore';
import { Camera, Plus, Trash2 } from 'lucide-react';
import exifr from 'exifr';
import imageCompression from 'browser-image-compression';
import heic2any from 'heic2any'; // Static import to ensure it loads

interface LocationItem {
  description: string;
  hint: string;
  photoUrl: string;
  lat: number;
  lng: number;
}

const Create = () => {
  const navigate = useNavigate();
  const { user } = useUserStore();
  const [locations, setLocations] = useState<LocationItem[]>(() => {
    const saved = localStorage.getItem('create_locations');
    return saved ? JSON.parse(saved) : [];
  });
  const [formData, setFormData] = useState(() => {
    const saved = localStorage.getItem('create_formData');
    return saved ? JSON.parse(saved) : {
      title: '',
      description: '',
      difficulty: 3,
    };
  });
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isPublic, setIsPublic] = useState(true); // Default to public

  // Auto-save effects
  React.useEffect(() => {
    localStorage.setItem('create_locations', JSON.stringify(locations));
  }, [locations]);

  React.useEffect(() => {
    localStorage.setItem('create_formData', JSON.stringify(formData));
  }, [formData]);

  const clearCache = () => {
    localStorage.removeItem('create_locations');
    localStorage.removeItem('create_formData');
    setLocations([]);
    setFormData({ title: '', description: '', difficulty: 3 });
  };

  const [createdCode, setCreatedCode] = useState<{code: string, expires: string} | null>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setUploading(true);
    const originalFile = e.target.files[0];

    try {
      // 1. Extract GPS from original file BEFORE compression (compression strips metadata)
      let lat = 0;
      let lng = 0;
      try {
        const gpsData = await exifr.gps(originalFile);
        if (gpsData) {
          lat = gpsData.latitude;
          lng = gpsData.longitude;
        } else {
            console.warn("No GPS data found in image, using fallback/current location");
            // Fallback to browser geolocation if image has no GPS
            await new Promise<void>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        lat = pos.coords.latitude;
                        lng = pos.coords.longitude;
                        resolve();
                    },
                    (err) => {
                        console.error("Geolocation failed:", err);
                        // If both fail, maybe alert user? For now let's keep 0,0 or random mock
                        // Using previous random mock as last resort for demo
                        lat = 31.2304 + (Math.random() - 0.5) * 0.01;
                        lng = 121.4737 + (Math.random() - 0.5) * 0.01;
                        resolve();
                    }
                );
            });
        }
      } catch (e) {
        console.error("Error reading EXIF:", e);
      }

      // 2. Compress Image
      const options = {
        maxSizeMB: 0.5,           // Compress to ~500KB
        maxWidthOrHeight: 1920, // Resize to max 1920px
        useWebWorker: true,
        fileType: 'image/jpeg'  // Convert to JPEG
      };
      
      console.log('Starting processing...');
      let fileToUpload = originalFile;

      // Only attempt client-side compression for non-HEIC images
      // For HEIC, we send original file to backend
      const isHeic = originalFile.name.toLowerCase().endsWith('.heic') || 
                     originalFile.type === 'image/heic' ||
                     originalFile.type === 'image/heif';

      if (!isHeic) {
        try {
            console.log('Compressing standard image...');
            const compressedFile = await imageCompression(originalFile, options);
            // Ensure we send a File object with a name, and force .jpg extension
            const newFileName = originalFile.name.replace(/\.[^/.]+$/, "") + ".jpg";
            fileToUpload = new File([compressedFile], newFileName, { type: 'image/jpeg' });
        } catch (err) {
            console.warn('Client-side compression failed, uploading original:', err);
        }
      } else {
          console.log('HEIC detected, skipping client-side compression, uploading raw file...');
      }
      
      // 3. Upload File
      const uploadData = new FormData();
      uploadData.append('file', fileToUpload);
      
      // Pass a flag to tell backend to convert if needed (though backend can detect too)
      if (isHeic) {
          uploadData.append('convert', 'true');
      }
      
      const { url, lat: serverLat, lng: serverLng, message } = await api.upload('/upload', uploadData);
      
      // Check for duplicates in current list
      if (locations.some(loc => loc.photoUrl === url)) {
          alert("This image has already been added to the current hunt.");
          return;
      }

      if (message) {
          alert(message);
      }

      // Use server GPS if available (priority), otherwise fallback to local parsing if we had it (though backend is more reliable)
      const finalLat = (serverLat && serverLat !== 0) ? serverLat : lat;
      const finalLng = (serverLng && serverLng !== 0) ? serverLng : lng;

      // 4. Add to locations
      setLocations([...locations, {
        description: '',
        hint: '',
        photoUrl: url, 
        lat: finalLat,
        lng: finalLng
      }]);

    } catch (error: any) {
      console.error(error);
      alert('Error processing image: ' + error.message);
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  const updateLocation = (index: number, field: keyof LocationItem, value: string) => {
    const newLocations = [...locations];
    // @ts-ignore
    newLocations[index][field] = value;
    setLocations(newLocations);
  };

  const removeLocation = (index: number) => {
    setLocations(locations.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locations.length === 0) {
      alert("Please add at least one location!");
      return;
    }
    
    setLoading(true);
    
    try {
        const response = await api.post('/game/create', {
            ...formData,
            locations,
            isPublic,
            userId: user?.id // Temporary until backend middleware extracts from token
        });
        
        console.log("Create success:", response);

        if (!isPublic && response.joinCode) {
            setCreatedCode({ code: response.joinCode, expires: response.expiresAt });
            clearCache();
        } else {
            alert("Treasure Hunt Created Successfully!");
            clearCache(); // Clear cache on success
            navigate('/');
        }
    } catch (error: any) {
        console.error("Create failed:", error);
        alert("Failed to create treasure: " + error.message);
    } finally {
        setLoading(false);
    }
  };

  if (createdCode) {
      return (
          <div className="min-h-screen bg-gray-900 text-white p-6 flex flex-col items-center justify-center">
              <div className="bg-gray-800 p-8 rounded-2xl w-full max-w-md text-center shadow-xl border border-gray-700">
                  <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Treasure Created!</h2>
                  <p className="text-gray-400 mb-6">This is a private hunt. Share this code with your friends to let them join.</p>
                  
                  <div className="bg-black/50 p-6 rounded-xl mb-6">
                      <div className="text-sm text-gray-500 uppercase tracking-widest mb-2">Join Code</div>
                      <div className="text-5xl font-mono font-bold text-white tracking-[0.2em]">{createdCode.code}</div>
                      <div className="text-xs text-yellow-500 mt-2">Expires in 5 minutes</div>
                  </div>
                  
                  <button 
                      onClick={() => navigate('/')}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition"
                  >
                      Done
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 pb-20">
      <h1 className="text-2xl font-bold mb-6">Create New Hunt</h1>
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Title</label>
          <input
            type="text"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Difficulty (1-5)</label>
          <input
            type="number"
            min="1"
            max="5"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
            value={formData.difficulty}
            onChange={(e) => setFormData({ ...formData, difficulty: parseInt(e.target.value) })}
            required
          />
        </div>

        <div className="flex items-center gap-3 border rounded p-3 bg-gray-50">
          <input
            type="checkbox"
            id="isPublic"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="isPublic" className="text-sm cursor-pointer select-none">
            <span className="font-medium text-gray-900 block">Make Public</span>
            <span className="text-gray-500">Visible to everyone on the homepage</span>
          </label>
        </div>

        <div className="border-t pt-4">
          <h3 className="font-medium mb-4">Locations ({locations.length})</h3>
          
          <div className="space-y-4 mb-4">
            {locations.map((loc, idx) => (
              <div key={idx} className="border rounded p-3 bg-gray-50 relative">
                <button 
                    type="button"
                    onClick={() => removeLocation(idx)}
                    className="absolute top-2 right-2 text-red-500"
                >
                    <Trash2 size={18} />
                </button>
                <div className="flex gap-4">
                    <img src={loc.photoUrl} className="w-20 h-20 object-cover rounded bg-gray-200" />
                    <div className="flex-1 space-y-2">
                        <input 
                            placeholder="Description (e.g. Bronze Lion)"
                            className="w-full text-sm border rounded p-1"
                            value={loc.description}
                            onChange={(e) => updateLocation(idx, 'description', e.target.value)}
                        />
                        <input 
                            placeholder="Hint (e.g. Near the gate)"
                            className="w-full text-sm border rounded p-1"
                            value={loc.hint}
                            onChange={(e) => updateLocation(idx, 'hint', e.target.value)}
                        />
                        <div className="text-xs text-gray-500">
                            GPS: {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                        </div>
                    </div>
                </div>
              </div>
            ))}
          </div>

          <label className={`
            flex items-center justify-center w-full p-4 border-2 border-dashed rounded-lg cursor-pointer
            ${uploading ? 'bg-gray-100 border-gray-300' : 'border-blue-300 hover:bg-blue-50'}
          `}>
            <div className="flex flex-col items-center">
                {uploading ? (
                    <span className="text-sm text-gray-500">Uploading...</span>
                ) : (
                    <>
                        <Camera className="text-blue-500 mb-1" />
                        <span className="text-sm text-blue-600 font-medium">Add Photo Location</span>
                    </>
                )}
            </div>
            <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleImageUpload}
                disabled={uploading}
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={loading || locations.length === 0}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 mt-6 disabled:bg-gray-400"
        >
          {loading ? 'Creating...' : 'Publish Hunt'}
        </button>
      </form>
    </div>
  );
};

export default Create;
