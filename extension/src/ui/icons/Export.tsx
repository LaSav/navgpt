export function Export({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox='0 0 16 16'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
    >
      <path
        d='M8 2v7M5.5 6.5L8 9l2.5-2.5M3 11.5v1A1.5 1.5 0 0 0 4.5 14h7A1.5 1.5 0 0 0 13 12.5v-1'
        stroke='currentColor'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}
