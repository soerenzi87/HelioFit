import React from 'react';

interface ModalWrapperProps {
  children: React.ReactNode;
  onClose?: () => void;
  zIndex?: number;
  showCloseButton?: boolean;
  /** 'center' (default) or 'bottom' (mobile sheet style) */
  align?: 'center' | 'bottom';
  className?: string;
}

const ModalWrapper: React.FC<ModalWrapperProps> = ({
  children,
  onClose,
  zIndex = 300,
  showCloseButton = true,
  align = 'center',
  className,
}) => (
  <div
    style={{ zIndex }}
    className={`fixed inset-0 bg-[#0f172a]/80 backdrop-blur-xl flex ${
      align === 'bottom' ? 'items-end sm:items-center' : 'items-center'
    } justify-center ${align === 'bottom' ? 'sm:p-6' : 'p-3 sm:p-6'} animate-fade-in transition-all`}
    onClick={onClose ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
  >
    <div className={`relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-[2.5rem] sm:rounded-[3rem] border border-white/10 bg-[#10151d] p-5 sm:p-8 shadow-[0_0_100px_rgba(0,0,0,0.5)] ${className || ''}`}>
      {showCloseButton && onClose && (
        <button
          onClick={onClose}
          className="sticky top-0 ml-auto mb-4 w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white/5 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-white/10 flex items-center justify-center transition-all z-10"
        >
          <i className="fas fa-times"></i>
        </button>
      )}
      {children}
    </div>
  </div>
);

export default ModalWrapper;
