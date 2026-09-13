/*
 * 使用 Motion spring 为可点击工作区卡片提供轻量磁吸与按压反馈。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'motion/react';
import type { PointerEvent, ReactNode } from 'react';

const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
const MAGNETIC_RANGE = 4;
const HOVER_LIFT = 2;
const SPRING = {
  mass: 1,
  stiffness: 100,
  damping: 10,
};

type MagneticCardProps = {
  children: ReactNode;
  className: string;
  enabled?: boolean;
  onClick?: () => void;
};

export default function MagneticCard({
  children,
  className,
  enabled = true,
  onClick,
}: MagneticCardProps) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const springX = useSpring(x, SPRING);
  const springY = useSpring(y, SPRING);
  const springScale = useSpring(scale, SPRING);
  const transform = useMotionTemplate`translate3d(${springX}px, ${springY}px, 0) scale(${springScale})`;
  const motionEnabled = enabled && !reduceMotion;

  const reset = () => {
    x.set(0);
    y.set(0);
    scale.set(1);
  };

  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (!motionEnabled || !window.matchMedia(FINE_POINTER_QUERY).matches) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
    const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;
    x.set(horizontal * MAGNETIC_RANGE * 2);
    y.set(vertical * MAGNETIC_RANGE * 2 - HOVER_LIFT);
    scale.set(1.01);
  };

  const press = () => {
    if (motionEnabled) scale.set(0.97);
  };

  const release = () => {
    if (!motionEnabled) return;
    scale.set(window.matchMedia(FINE_POINTER_QUERY).matches ? 1.01 : 1);
  };

  if (!enabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.button
      type="button"
      className={className}
      style={{ transform: motionEnabled ? transform : 'none' }}
      onPointerMove={move}
      onPointerLeave={reset}
      onPointerCancel={reset}
      onPointerDown={press}
      onPointerUp={release}
      onClick={onClick}
    >
      {children}
    </motion.button>
  );
}
