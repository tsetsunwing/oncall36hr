import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** 螢幕閱讀器名稱同提示，必須係中文。 */
  label: string;
}

/** 圖示掣：可見的是圖示，名稱同提示用同一句中文。 */
export function IconButton({
  icon: Icon,
  label,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={className ? `icon-btn ${className}` : 'icon-btn'}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon size={16} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
