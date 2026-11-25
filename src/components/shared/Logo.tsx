import React from 'react';

interface LogoProps {
  className?: string;
  color?: string;
}

export const BrosDevLogo: React.FC<LogoProps> = ({
  className = 'w-7 h-7',
  color = '#A90706',
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={className}
      aria-label="BrosDev Logo"
      role="img"
    >
      <path
        fill={color}
        fillRule="evenodd"
        d="M 237 121 L 244 121 L 333 177 L 281 213 L 239 189 L 198 215 L 196 267 L 242 295 L 288 263 L 364 303 L 354 313 L 242 437 L 148 335 L 148 175 Z M 238 73 L 103 149 L 103 371 L 243 437 L 407 331 L 407 275 L 329 235 L 377 201 L 377 147 L 247 75 Z"
      />
    </svg>
  );
};

export default BrosDevLogo;
