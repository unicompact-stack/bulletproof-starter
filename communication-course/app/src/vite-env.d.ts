/// <reference types="vite/client" />

declare module 'virtual:content/*' {
  const content: string
  export default content
}

declare module 'virtual:library/sources' {
  const content: string
  export default content
}

declare module 'virtual:library/topics' {
  const content: string
  export default content
}

declare module 'virtual:library/articles' {
  const articles: { file: string; raw: string }[]
  export default articles
}
