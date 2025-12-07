import React from 'react';

interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Card({ title, children, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:border-primary-500 transition-colors ${className}`}
    >
      {title && <h3 className="text-xl font-semibold mb-3">{title}</h3>}
      {children}
    </div>
  );
}
