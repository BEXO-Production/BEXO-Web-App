import React, { useState, useRef, useEffect } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Button, cn } from '../design-system/primitives';
import { Camera, Image as ImageIcon, Crop, ArrowRight, Trash2, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';

export default function Step4Photo() {
  const { data, updateData, nextStep } = useOnboarding();
  const [photo, setPhoto] = useState<string | null>(data.photoUrl || null);
  const [isCropping, setIsCropping] = useState(false);
  
  // Cropper states
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [isSwooshing, setIsSwooshing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Automatically start cropping when a file is selected
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const url = URL.createObjectURL(e.target.files[0]);
      setPhoto(url);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setNaturalSize(null);
      setIsCropping(true);
    }
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  };

  // Panning boundary calculation
  const getBounds = () => {
    if (!naturalSize) return { x: 0, y: 0 };
    const D = 192; // viewport diameter in pixels (w-48 = 12rem = 192px)
    const W_nat = naturalSize.w;
    const H_nat = naturalSize.h;
    const R = W_nat / H_nat;

    let W_s = 0;
    let H_s = 0;

    if (R > 1) {
      // Landscape: height fits D, width is D * R
      W_s = D * R * zoom;
      H_s = D * zoom;
    } else {
      // Portrait: width fits D, height is D / R
      W_s = D * zoom;
      H_s = (D / R) * zoom;
    }

    return {
      x: Math.max(0, (W_s - D) / 2),
      y: Math.max(0, (H_s - D) / 2)
    };
  };

  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom);
    
    // Clamp offset immediately to fit the new zoom level bounds
    if (naturalSize) {
      const D = 192;
      const R = naturalSize.w / naturalSize.h;
      let W_s = R > 1 ? D * R * newZoom : D * newZoom;
      let H_s = R > 1 ? D * newZoom : (D / R) * newZoom;
      const boundX = Math.max(0, (W_s - D) / 2);
      const boundY = Math.max(0, (H_s - D) / 2);
      
      setOffset(prev => ({
        x: Math.max(-boundX, Math.min(boundX, prev.x)),
        y: Math.max(-boundY, Math.min(boundY, prev.y))
      }));
    }
  };

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isCropping) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !isCropping || !naturalSize) return;
    e.preventDefault();

    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;

    const bounds = getBounds();
    const clampedX = Math.max(-bounds.x, Math.min(bounds.x, newX));
    const clampedY = Math.max(-bounds.y, Math.min(bounds.y, newY));

    setOffset({ x: clampedX, y: clampedY });
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  // Touch drag handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isCropping || e.touches.length !== 1) return;
    setIsDragging(true);
    const touch = e.touches[0];
    setDragStart({ x: touch.clientX - offset.x, y: touch.clientY - offset.y });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !isCropping || !naturalSize || e.touches.length !== 1) return;
    const touch = e.touches[0];

    const newX = touch.clientX - dragStart.x;
    const newY = touch.clientY - dragStart.y;

    const bounds = getBounds();
    const clampedX = Math.max(-bounds.x, Math.min(bounds.x, newX));
    const clampedY = Math.max(-bounds.y, Math.min(bounds.y, newY));

    setOffset({ x: clampedX, y: clampedY });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Crop drawing using canvas
  const handleConfirmCrop = () => {
    if (!photo || !imageRef.current) {
      setIsCropping(false);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsCropping(false);
      return;
    }

    const img = imageRef.current;
    const W_nat = img.naturalWidth;
    const H_nat = img.naturalHeight;
    const R = W_nat / H_nat;

    const C = 400; // Output Canvas size
    const D = 192; // Viewport size

    let S_canvas = 0;
    if (R > 1) {
      // Landscape: height fits canvas
      S_canvas = zoom * (C / H_nat);
    } else {
      // Portrait: width fits canvas
      S_canvas = zoom * (C / W_nat);
    }

    const W_dest = W_nat * S_canvas;
    const H_dest = H_nat * S_canvas;

    const X_canvas = offset.x * (C / D);
    const Y_canvas = offset.y * (C / D);

    const X_dest = (C - W_dest) / 2 + X_canvas;
    const Y_dest = (C - H_dest) / 2 + Y_canvas;

    // Fill white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, C, C);

    // Draw the image onto the canvas with scale and translations
    ctx.drawImage(img, X_dest, Y_dest, W_dest, H_dest);

    try {
      const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setPhoto(croppedDataUrl);

      // Upload to R2 in the background
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], "profile-photo.jpg", { type: "image/jpeg" });
        const formData = new FormData();
        formData.append("file", file);

        const token = localStorage.getItem('token');
        try {
          const res = await fetch("/api/profile/upload", {
            method: "POST",
            headers: {
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: formData
          });
          if (res.ok) {
            const result = await res.json();
            if (result.url) {
              setPhoto(result.url);
              updateData({ photoUrl: result.url });
              return;
            }
          }
        } catch (err) {
          console.error("Failed to upload profile photo to R2:", err);
        }

        // Fallback to base64 if upload failed
        updateData({ photoUrl: croppedDataUrl });
      }, "image/jpeg", 0.9);

    } catch (err) {
      console.error("Failed to crop image on canvas: ", err);
    }

    // Reset zoom and offset
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setIsCropping(false);
  };

  const handleRemovePhoto = () => {
    setPhoto(null);
    updateData({ photoUrl: '' });
    setIsCropping(false);
  };

  const handleContinue = () => {
    setIsSwooshing(true);
    setTimeout(() => {
      nextStep(4);
    }, 600);
  };

  return (
    <div className="flex flex-col h-full justify-center max-w-2xl w-full mx-auto pb-10">
      {/* Step Indicator */}
      <span className="text-xs font-semibold text-indigo-500 uppercase tracking-widest mb-1.5 text-left">
        STEP 4 OF 9
      </span>

      <div className="mb-8 text-left">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-2.5 tracking-tight">
          Profile Photo
        </h1>
        <p className="text-slate-500 text-sm md:text-base">
          Add a professional headshot. This is the first thing recruiters will see.
        </p>
      </div>

      <div className="flex flex-col items-center mb-8 bg-white/40 p-8 rounded-2xl border border-slate-100 backdrop-blur-sm shadow-sm max-w-md w-full mx-auto">
        <div 
          ref={containerRef}
          className="relative group cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Main Circle Viewport */}
          <div className={cn(
            "w-48 h-48 rounded-full overflow-hidden border-4 flex items-center justify-center bg-slate-50 relative select-none transition-all duration-300",
            photo ? "border-slate-300" : "border-slate-200 border-dashed hover:border-slate-400 hover:bg-slate-100/50"
          )}>
            {photo ? (
              <img 
                ref={imageRef}
                src={photo} 
                alt="Profile preview" 
                onLoad={handleImageLoad}
                draggable="false"
                className={cn(
                  "max-w-none origin-center absolute select-none pointer-events-none transition-transform duration-100 ease-out",
                  isCropping ? "" : "w-full h-full object-cover"
                )}
                style={isCropping ? {
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                  top: '50%',
                  left: '50%',
                  transformOrigin: 'center center',
                  marginLeft: naturalSize ? (naturalSize.w / naturalSize.h > 1 ? `-${(192 * (naturalSize.w / naturalSize.h)) / 2}px` : '-96px') : '-96px',
                  marginTop: naturalSize ? (naturalSize.w / naturalSize.h > 1 ? '-96px' : `-${(192 / (naturalSize.w / naturalSize.h)) / 2}px`) : '-96px',
                  width: naturalSize ? (naturalSize.w / naturalSize.h > 1 ? `${192 * (naturalSize.w / naturalSize.h)}px` : '192px') : '192px',
                  height: naturalSize ? (naturalSize.w / naturalSize.h > 1 ? '192px' : `${192 / (naturalSize.w / naturalSize.h)}px`) : '192px'
                } : undefined}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                <ImageIcon className="w-12 h-12 mb-2 text-slate-300" />
                <span className="text-xs font-medium">No photo selected</span>
              </div>
            )}

            {/* Drag to reposition overlay indicator */}
            {isCropping && (
              <div className="absolute inset-0 bg-black/10 rounded-full pointer-events-none flex items-center justify-center">
                <div className="bg-black/60 text-white text-[10px] px-2 py-1 rounded-full font-medium flex items-center gap-1">
                  <Crop className="w-3 h-3" /> Drag to Crop
                </div>
              </div>
            )}

            {/* Hover overlay when not cropping and photo is present */}
            {photo && !isCropping && (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center cursor-pointer select-none text-white gap-1"
              >
                <Camera className="w-5 h-5 text-white" />
                <span className="text-[10px] font-semibold uppercase tracking-wider">Change</span>
              </div>
            )}
          </div>

          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handlePhotoSelect} 
          />

          {/* Trigger button when no photo exists */}
          {!photo && (
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-12 h-12 bg-indigo-600 text-white rounded-full shadow-md flex items-center justify-center hover:bg-indigo-700 transition-all border-2 border-white cursor-pointer"
            >
              <Camera className="w-5 h-5" />
            </button>
          )}
        </div>



        {/* Action button options when a photo exists */}
        {photo && !isCropping && (
          <div className="flex gap-4 mt-6">
            <button
              type="button"
              onClick={() => setIsCropping(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl transition-colors cursor-pointer"
            >
              <Crop className="w-3.5 h-3.5" /> Reposition / Scale
            </button>
            <button
              type="button"
              onClick={handleRemovePhoto}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-xl transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          </div>
        )}
      </div>

      {/* Crop Controls */}
      {isCropping ? (
        <div className="space-y-6 max-w-md w-full mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Zoom controls */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 shadow-inner space-y-3">
            <div className="flex justify-between items-center text-xs font-medium text-slate-500">
              <span className="flex items-center gap-1"><ZoomOut className="w-3.5 h-3.5" /> Zoom Out</span>
              <span className="text-indigo-500 font-bold">{Math.round(zoom * 100)}%</span>
              <span className="flex items-center gap-1"><ZoomIn className="w-3.5 h-3.5" /> Zoom In</span>
            </div>
            
            <input 
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div className="flex gap-4">
            <Button 
              type="button"
              variant="outline"
              onClick={() => {
                setIsCropping(false);
                setZoom(1);
                setOffset({ x: 0, y: 0 });
              }}
              className="flex-1 h-12 text-sm border-slate-200 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </Button>
            <Button 
              type="button"
              onClick={handleConfirmCrop} 
              className="flex-1 h-12 text-sm bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 cursor-pointer text-white shadow"
            >
              Looks Good
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 pt-4 max-w-md w-full mx-auto text-center onboarding-cta">
          <button
            type="button"
            className={`w-full h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-3 group cursor-pointer shadow-lg shadow-slate-900/20 btn-continue-wrap px-6 disabled:opacity-50 disabled:pointer-events-none${isSwooshing ? ' is-swooshing' : ''}`}
            onClick={handleContinue}
            disabled={!photo || isSwooshing}
          >
            <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center arrow-box shrink-0">
              <ArrowRight className="w-5 h-5 text-white" />
            </div>
            <span className="btn-label">Save & Continue</span>
          </button>

          <p className="text-sm text-slate-500 mt-4">
            Don't want to upload a photo?{' '}
            <button 
              type="button" 
              onClick={handleContinue} 
              className="text-indigo-500 font-medium hover:underline cursor-pointer"
            >
              Skip for now
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
