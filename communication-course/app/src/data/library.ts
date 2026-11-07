import sourcesRaw from 'virtual:library/sources'
import { parseSources } from '../lib/library'
import type { Source } from '../types'

export const sources: Source[] = parseSources(sourcesRaw)
