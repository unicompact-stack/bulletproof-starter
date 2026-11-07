import rawArticles from 'virtual:library/articles'
import rawTopics from 'virtual:library/topics'
import { parseArticle, parseTopics } from '../lib/article'
import type { Article, Topic } from '../types'

export const articles: Article[] = rawArticles.map((a) => parseArticle(a.raw, a.file))

export const topics: Topic[] = parseTopics(rawTopics)

export function topicTitle(id: string): string {
  return topics.find((t) => t.id === id)?.title ?? id
}
