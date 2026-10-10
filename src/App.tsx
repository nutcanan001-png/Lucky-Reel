/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  WheelItem,
  WheelPreset,
  WheelSettings,
  WinnerRecord,
  BackgroundConfig,
} from './types/wheel';
import { DEFAULT_PRESETS } from './utils/colorPalettes';
import { WheelCanvas } from './components/WheelCanvas';
import { CandidateEditor } from './components/CandidateEditor';
import { PresetManager } from './components/PresetManager';
import { WinnerModal } from './components/WinnerModal';
import { WinnerHistoryModal } from './components/WinnerHistoryModal';
import { SettingsModal } from './components/SettingsModal';
import {
  BackgroundCustomizer,
  getBackgroundStyle,
} from './components/BackgroundCustomizer';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { exportWheelSnapshot } from './utils/imageExport';
import { playClickSound } from './utils/audio';
import {
  Sparkles,
  Settings,
  History,
  Image as ImageIcon,
  Camera,
  Maximize2,
  Minimize2,
  RotateCcw,
  ListFilter,
  Star,
  Gift,
} from 'lucide-react';

const STORAGE_KEYS = {
  PRESETS: 'lucky_wheel_presets_v1',
  ACTIVE_PRESET_ID: 'lucky_wheel_active_preset_id_v1',
  SETTINGS: 'lucky_wheel_settings_v1',
  HISTORY: 'lucky_wheel_history_v1',
  BACKGROUND: 'lucky_wheel_bg_v1',
};

const DEFAULT_SETTINGS: WheelSettings = {
  spinDuration: 6,
  autoRemoveWinner: true, // Default to true as specifically requested!
  soundEnabled: true,
  soundVolume: 0.8,
  confettiEnabled: true,
  showWinnerModal: true,
  wheelTheme: 'gold',
};

const DEFAULT_BG_CONFIG: BackgroundConfig = {
  type: 'preset',
  presetId: 'nebula',
  blur: 0,
  dimOverlay: 40,
  brightness: 100,
};

export default function App() {
  // 1. State initialization with LocalStorage fallbacks
  const [presets, setPresets] = useState<WheelPreset[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PRESETS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_PRESETS;
  });

  const [activePresetId, setActivePresetId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_PRESET_ID);
      if (saved) return saved;
    } catch {}
    return DEFAULT_PRESETS[0].id;
  });

  const [items, setItems] = useState<WheelItem[]>(() => {
    const active = presets.find((p) => p.id === activePresetId) || presets[0] || DEFAULT_PRESETS[0];
    return active ? [...active.items] : [];
  });

  const [settings, setSettings] = useState<WheelSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_SETTINGS;
  });

  const [history, setHistory] = useState<WinnerRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.HISTORY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [bgConfig, setBgConfig] = useState<BackgroundConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.BACKGROUND);
      if (saved) return { ...DEFAULT_BG_CONFIG, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_BG_CONFIG;
  });

  // UI State
  const [isSpinning, setIsSpinning] = useState(false);
  const [currentWinner, setCurrentWinner] = useState<WinnerRecord | null>(null);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [lastAutoRemoved, setLastAutoRemoved] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showBgCustomizer, setShowBgCustomizer] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'items' | 'presets'>('items');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const wheelCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Synchronize localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PRESETS, JSON.stringify(presets));
    } catch {}
  }, [presets]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PRESET_ID, activePresetId);
    } catch {}
  }, [activePresetId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
    } catch {}
  }, [history]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.BACKGROUND, JSON.stringify(bgConfig));
    } catch {}
  }, [bgConfig]);

  // Keyboard shortcut listener (Space to spin, Esc to close modals)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      if (e.code === 'Space' && !isSpinning && items.some((it) => it.enabled)) {
        e.preventDefault();
        // Click on spin button
        const spinBtn = document.querySelector('button[title*="หมุน"]') as HTMLButtonElement;
        if (spinBtn) spinBtn.click();
      }

      if (e.code === 'Escape') {
        setShowWinnerModal(false);
        setShowSettingsModal(false);
        setShowBgCustomizer(false);
        setShowHistoryModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSpinning, items]);

  // Fullscreen toggle handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  // Preset switching
  const handleSelectPreset = (preset: WheelPreset) => {
    if (isSpinning) return;
    setActivePresetId(preset.id);
    setItems([...preset.items]);
    if (settings.soundEnabled) playClickSound(settings.soundVolume);
  };

  // Save current wheel as a new preset
  const handleSavePreset = (name: string, savedItems: WheelItem[]) => {
    const newPreset: WheelPreset = {
      id: `preset-${Date.now()}`,
      name,
      items: [...savedItems],
      createdAt: Date.now(),
      isDefault: false,
    };
    const updated = [newPreset, ...presets];
    setPresets(updated);
    setActivePresetId(newPreset.id);
  };

  // Delete preset
  const handleDeletePreset = (presetId: string) => {
    const filtered = presets.filter((p) => p.id !== presetId);
    setPresets(filtered);
    if (activePresetId === presetId && filtered.length > 0) {
      setActivePresetId(filtered[0].id);
      setItems([...filtered[0].items]);
    }
  };

  // Import presets
  const handleImportPresets = (imported: WheelPreset[]) => {
    const combined = [...imported, ...presets];
    setPresets(combined);
    if (imported[0]) {
      setActivePresetId(imported[0].id);
      setItems([...imported[0].items]);
    }
  };

  // Handle spin start
  const handleSpinStart = useCallback(() => {
    setIsSpinning(true);
  }, []);

  // Current active preset object
  const activePreset =
    presets.find((p) => p.id === activePresetId) || presets[0] || DEFAULT_PRESETS[0];

  // Handle spin end & winner selection
  const handleSpinEnd = useCallback(
    (winnerItem: WheelItem) => {
      setIsSpinning(false);
      const roundNumber = history.length + 1;

      const newRecord: WinnerRecord = {
        id: `win-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        round: roundNumber,
        timestamp: Date.now(),
        item: { ...winnerItem },
        presetName: activePreset ? activePreset.name : 'วงล้อจับรางวัล',
      };

      // Add to winner history log
      setHistory((prev) => [newRecord, ...prev]);
      setCurrentWinner(newRecord);

      // Auto-remove winner if option enabled!
      let removed = false;
      if (settings.autoRemoveWinner) {
        setItems((prevItems) => prevItems.filter((it) => it.id !== winnerItem.id));
        removed = true;
      }
      setLastAutoRemoved(removed);

      // Show winner popup
      if (settings.showWinnerModal) {
        setShowWinnerModal(true);
      }
    },
    [history.length, activePreset, settings.autoRemoveWinner, settings.showWinnerModal]
  );

  // Restore winner to wheel (Undo removal)
  const handleRestoreWinner = (item: WheelItem) => {
    // Check if item already exists
    if (!items.some((it) => it.id === item.id)) {
      setItems((prev) => [...prev, { ...item, enabled: true }]);
    }
  };

  // Manually remove winner from wheel
  const handleRemoveWinnerManually = (item: WheelItem) => {
    setItems((prev) => prev.filter((it) => it.id !== item.id));
    setLastAutoRemoved(true);
  };

  // Export screenshot of current wheel
  const handleExportWheelImage = () => {
    if (wheelCanvasRef.current) {
      exportWheelSnapshot(wheelCanvasRef.current, activePreset?.name || 'วงล้อนำโชค');
    }
  };

  // Reset current wheel items to default of current preset
  const handleResetCurrentWheel = () => {
    if (confirm('คุณต้องการรีเซ็ตรายชื่อในวงล้อกลับเป็นค่าเริ่มต้นของพรีเซ็ตนี้ใช่หรือไม่?')) {
      if (activePreset) {
        setItems([...activePreset.items]);
      }
    }
  };

  return (
    <div
      className="relative min-h-screen text-slate-100 flex flex-col transition-colors duration-500 overflow-x-hidden"
      style={getBackgroundStyle(bgConfig)}
    >
      {/* Background Dim & Blur Overlay */}
      <div
        className="fixed inset-0 pointer-events-none transition-all duration-300"
        style={{
          backgroundColor: `rgba(2, 6, 23, ${bgConfig.dimOverlay / 100})`,
          backdropFilter: bgConfig.blur > 0 ? `blur(${bgConfig.blur}px)` : undefined,
        }}
      />

      {/* Main Container */}
      <div className="relative z-10 flex flex-col flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5">
        {/* Top Navigation / App Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-white/10 backdrop-blur-md bg-slate-950/40 rounded-2xl px-4 py-3 shadow-lg">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/20">
              <Gift className="w-5 h-5 text-slate-950" />
              <Sparkles className="w-3.5 h-3.5 absolute -top-1 -right-1 text-yellow-200 animate-pulse" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-white flex items-center gap-2">
                <span>วงล้อจับรางวัล</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Lucky Wheel
                </span>
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-400">
                {activePreset ? activePreset.name : 'สุ่มผู้โชคดี'} • สุ่มแล้ว {history.length} ครั้ง
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center flex-wrap gap-2">
            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Custom Background Button */}
            <button
              onClick={() => setShowBgCustomizer(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 text-xs font-medium text-slate-200 transition cursor-pointer"
              title="เปลี่ยนภาพพื้นหลัง หรืออัปโหลดภาพของคุณเอง"
            >
              <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">เปลี่ยนพื้นหลัง</span>
            </button>

            {/* Export Wheel Snapshot */}
            <button
              onClick={handleExportWheelImage}
              disabled={isSpinning || items.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 text-xs font-medium text-slate-200 transition cursor-pointer disabled:opacity-40"
              title="บันทึกภาพวงล้อเป็นไฟล์ PNG"
            >
              <Camera className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">บันทึกภาพวงล้อ</span>
            </button>

            {/* History Modal Button */}
            <button
              onClick={() => setShowHistoryModal(true)}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 text-xs font-medium text-slate-200 transition cursor-pointer"
              title="ดูประวัติผู้ชนะทั้งหมด"
            >
              <History className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">ประวัติ</span>
              {history.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px]">
                  {history.length}
                </span>
              )}
            </button>

            {/* Settings Modal Button */}
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 text-slate-300 hover:text-white transition cursor-pointer"
              title="ตั้งค่าวงล้อและระบบลบผู้ชนะอัตโนมัติ"
            >
              <Settings className="w-4 h-4 text-indigo-400" />
            </button>

            {/* Fullscreen Toggle Button */}
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 text-slate-300 hover:text-white transition cursor-pointer hidden md:flex"
              title={isFullscreen ? 'ออกจากโหมดเต็มจอ' : 'แสดงผลเต็มจอ'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </header>

        {/* Main Content Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1">
          {/* LEFT: Grand Wheel Canvas Area (7 Cols on desktop) */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-md rounded-3xl border border-white/10 p-4 sm:p-6 shadow-2xl relative overflow-hidden">
            {/* Auto-remove badge notice */}
            <div className="w-full flex items-center justify-between px-2 pb-2 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    settings.autoRemoveWinner ? 'bg-amber-400 animate-ping' : 'bg-slate-500'
                  }`}
                />
                <span className="font-medium text-slate-300">
                  {settings.autoRemoveWinner
                    ? 'โหมด: ลบผู้ชนะออกจากวงล้ออัตโนมัติ (เปิดอยู่)'
                    : 'โหมด: เก็บผู้ชนะไว้ในวงล้อ'}
                </span>
              </span>

              <button
                onClick={handleResetCurrentWheel}
                disabled={isSpinning}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-amber-300 transition cursor-pointer"
                title="รีเซ็ตรายชื่อกลับเป็นค่าเดิมของพรีเซ็ต"
              >
                <RotateCcw className="w-3 h-3" />
                <span>รีเซ็ตรายชื่อ</span>
              </button>
            </div>

            {/* Canvas Wheel Component */}
            <WheelCanvas
              items={items}
              settings={settings}
              isSpinning={isSpinning}
              onSpinStart={handleSpinStart}
              onSpinEnd={handleSpinEnd}
              canvasRefCallback={(c) => {
                wheelCanvasRef.current = c;
              }}
            />
          </div>

          {/* RIGHT: Candidate & Preset Panels (5 Cols on desktop) */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            {/* Tab switch bar */}
            <div className="flex rounded-2xl bg-slate-900/90 border border-slate-800 p-1 backdrop-blur-md shadow-lg">
              <button
                onClick={() => setActiveTab('items')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
                  activeTab === 'items'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <ListFilter className="w-4 h-4" />
                <span>รายชื่อ & ปรับแต่งสี ({items.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('presets')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
                  activeTab === 'presets'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Star className="w-4 h-4" />
                <span>รายการโปรด ({presets.length})</span>
              </button>
            </div>

            {/* Active Tab Panel */}
            <div className="flex-1">
              {activeTab === 'items' ? (
                <CandidateEditor
                  items={items}
                  onItemsChange={setItems}
                  disabled={isSpinning}
                />
              ) : (
                <PresetManager
                  presets={presets}
                  activePresetId={activePresetId}
                  currentItems={items}
                  onSelectPreset={handleSelectPreset}
                  onSavePreset={handleSavePreset}
                  onDeletePreset={handleDeletePreset}
                  onImportPresets={handleImportPresets}
                  disabled={isSpinning}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Winner Celebration Modal */}
      {showWinnerModal && currentWinner && (
        <WinnerModal
          winner={currentWinner}
          presetName={activePreset?.name || 'วงล้อจับรางวัล'}
          autoRemoved={lastAutoRemoved}
          soundEnabled={settings.soundEnabled}
          soundVolume={settings.soundVolume}
          confettiEnabled={settings.confettiEnabled}
          onClose={() => setShowWinnerModal(false)}
          onRestoreWinner={handleRestoreWinner}
          onRemoveWinnerManually={handleRemoveWinnerManually}
        />
      )}

      {/* Background Customizer Modal */}
      {showBgCustomizer && (
        <BackgroundCustomizer
          config={bgConfig}
          onChange={setBgConfig}
          onClose={() => setShowBgCustomizer(false)}
        />
      )}

      {/* Winner History Log Modal */}
      {showHistoryModal && (
        <WinnerHistoryModal
          history={history}
          onClose={() => setShowHistoryModal(false)}
          onClearHistory={() => setHistory([])}
          onRestoreWinner={handleRestoreWinner}
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          settings={settings}
          onUpdate={setSettings}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* Offline Status Toast Indicator */}
      <OfflineIndicator />
    </div>
  );
}
