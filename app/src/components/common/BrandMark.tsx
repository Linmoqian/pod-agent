/*
 * lian@lab 透明品牌图形统一入口。
 * Created on 2026-09-13
 * @author: https://github.com/Linmoqian
 */

import lianLabEmblem from '../../assets/lian-lab-emblem-transparent.png';
import styles from './BrandMark.module.css';

type BrandMarkProps = {
  size: number;
  label?: string;
  className?: string;
};

function BrandMark({ size, label, className }: BrandMarkProps) {
  return (
    <img
      className={[styles.mark, className].filter(Boolean).join(' ')}
      src={lianLabEmblem}
      width={size}
      height={size}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
    />
  );
}

export default BrandMark;
