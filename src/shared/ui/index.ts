import type { ReactNode } from 'react';
import React from 'react';

export type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
};

export function Button({ children, onClick }: ButtonProps) {
  return React.createElement('button', { onClick }, children);
}
