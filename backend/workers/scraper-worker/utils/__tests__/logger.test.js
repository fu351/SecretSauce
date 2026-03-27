import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createLogger, createScraperLogger, log } from '../logger'

describe('createLogger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.SCRAPER_DEBUG
    delete process.env.APP_DEBUG
    delete process.env.MYSTORE_DEBUG
    delete process.env.MY_STORE_DEBUG
  })

  it('creates a logger with the given name prefix', () => {
    const logger = createLogger('mystore')
    logger.info('hello')
    expect(console.log).toHaveBeenCalledWith('[mystore]', 'hello')
  })

  it('defaults to [app] when no name is given', () => {
    const logger = createLogger()
    logger.info('test')
    expect(console.log).toHaveBeenCalledWith('[app]', 'test')
  })

  it('normalizes name to lowercase and trims whitespace', () => {
    const logger = createLogger('  MyStore  ')
    logger.info('hi')
    expect(console.log).toHaveBeenCalledWith('[mystore]', 'hi')
  })

  it('does not output debug messages when debug is not enabled', () => {
    const logger = createLogger('store')
    logger.debug('hidden')
    expect(console.log).not.toHaveBeenCalled()
  })

  it('outputs debug messages when SCRAPER_DEBUG=1', () => {
    process.env.SCRAPER_DEBUG = '1'
    const logger = createLogger('store')
    logger.debug('visible')
    expect(console.log).toHaveBeenCalledWith('[store]', 'visible')
  })

  it('outputs debug messages when SCRAPER_DEBUG=true', () => {
    process.env.SCRAPER_DEBUG = 'true'
    const logger = createLogger('store')
    logger.debug('visible')
    expect(console.log).toHaveBeenCalledWith('[store]', 'visible')
  })

  it('outputs debug messages when provider-specific debug env var is set', () => {
    process.env.MYSTORE_DEBUG = 'true'
    const logger = createLogger('mystore')
    logger.debug('visible')
    expect(console.log).toHaveBeenCalledWith('[mystore]', 'visible')
  })

  it('uses underscores when building env key from name with non-alphanumeric chars', () => {
    process.env.MY_STORE_DEBUG = 'yes'
    const logger = createLogger('my-store')
    logger.debug('visible')
    expect(console.log).toHaveBeenCalledWith('[my-store]', 'visible')
  })

  it('calls console.warn for warn', () => {
    const logger = createLogger('test')
    logger.warn('caution')
    expect(console.warn).toHaveBeenCalledWith('[test]', 'caution')
  })

  it('calls console.error for error', () => {
    const logger = createLogger('test')
    logger.error('failed')
    expect(console.error).toHaveBeenCalledWith('[test]', 'failed')
  })

  it('passes multiple arguments through', () => {
    const logger = createLogger('test')
    logger.info('msg', { extra: true }, 42)
    expect(console.log).toHaveBeenCalledWith('[test]', 'msg', { extra: true }, 42)
  })

  it('does not double-prefix if message already starts with prefix', () => {
    const logger = createLogger('test')
    logger.info('[test] already prefixed')
    expect(console.log).toHaveBeenCalledWith('[test] already prefixed')
  })

  it('exposes isDebugEnabled=false by default', () => {
    const logger = createLogger('nodbg')
    expect(logger.isDebugEnabled).toBe(false)
  })

  it('exposes isDebugEnabled=true when SCRAPER_DEBUG is set', () => {
    process.env.SCRAPER_DEBUG = 'yes'
    const logger = createLogger('nodbg')
    expect(logger.isDebugEnabled).toBe(true)
  })

  it('exports a default log instance named [app]', () => {
    log.info('test')
    expect(console.log).toHaveBeenCalledWith('[app]', 'test')
  })

  it('createScraperLogger is an alias for createLogger', () => {
    expect(createScraperLogger).toBe(createLogger)
  })
})
