/// <reference types="vite/client" />

declare module 'virtual:content/*' {
  const content: string
  export default content
}

declare module 'virtual:library/sources' {
  const content: string
  export default content
}
