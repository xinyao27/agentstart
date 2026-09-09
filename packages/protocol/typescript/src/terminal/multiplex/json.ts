export type TerminalMultiplexJsonObject = Record<string, unknown>

export function encodeTerminalMultiplexJson(value: TerminalMultiplexJsonObject): Uint8Array {
  validateJsonValue(value)
  return new TextEncoder().encode(JSON.stringify(value))
}

export function decodeTerminalMultiplexJson(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexJsonObject | null {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(payload)
  } catch {
    return null
  }
  if (text.charCodeAt(0) === 0xfeff) {
    return null
  }
  try {
    const parser = new StrictJsonParser(text)
    const value = parser.parse()
    return isJsonObject(value) ? value : null
  } catch {
    return null
  }
}

class StrictJsonParser {
  private offset = 0
  private readonly text: string

  constructor(text: string) {
    this.text = text
  }

  parse(): unknown {
    this.skipWhitespace()
    const value = this.parseValue()
    this.skipWhitespace()
    if (this.offset !== this.text.length) {
      throw new Error('Trailing JSON data')
    }
    return value
  }

  private parseValue(): unknown {
    const token = this.text[this.offset]
    if (token === '{') {
      return this.parseObject()
    }
    if (token === '[') {
      return this.parseArray()
    }
    if (token === '"') {
      return this.parseString()
    }
    if (token === 't') {
      return this.parseLiteral('true', true)
    }
    if (token === 'f') {
      return this.parseLiteral('false', false)
    }
    if (token === 'n') {
      return this.parseLiteral('null', null)
    }
    return this.parseNumber()
  }

  private parseObject(): TerminalMultiplexJsonObject {
    const object: TerminalMultiplexJsonObject = {}
    const keys = new Set<string>()
    this.offset += 1
    this.skipWhitespace()
    if (this.text[this.offset] === '}') {
      this.offset += 1
      return object
    }
    while (this.offset < this.text.length) {
      const key = this.parseString()
      if (keys.has(key)) {
        throw new Error('Duplicate JSON key')
      }
      keys.add(key)
      this.skipWhitespace()
      this.expect(':')
      this.skipWhitespace()
      Object.defineProperty(object, key, {
        value: this.parseValue(),
        enumerable: true,
        configurable: true,
        writable: true
      })
      this.skipWhitespace()
      const token = this.text[this.offset]
      this.offset += 1
      if (token === '}') {
        return object
      }
      if (token !== ',') {
        throw new Error('Invalid JSON object')
      }
      this.skipWhitespace()
    }
    throw new Error('Unterminated JSON object')
  }

  private parseArray(): unknown[] {
    const array: unknown[] = []
    this.offset += 1
    this.skipWhitespace()
    if (this.text[this.offset] === ']') {
      this.offset += 1
      return array
    }
    while (this.offset < this.text.length) {
      array.push(this.parseValue())
      this.skipWhitespace()
      const token = this.text[this.offset]
      this.offset += 1
      if (token === ']') {
        return array
      }
      if (token !== ',') {
        throw new Error('Invalid JSON array')
      }
      this.skipWhitespace()
    }
    throw new Error('Unterminated JSON array')
  }

  private parseString(): string {
    if (this.text[this.offset] !== '"') {
      throw new Error('Expected JSON string')
    }
    const start = this.offset
    this.offset += 1
    while (this.offset < this.text.length) {
      const code = this.text.charCodeAt(this.offset)
      if (code === 0x22) {
        this.offset += 1
        const parsed: unknown = JSON.parse(this.text.slice(start, this.offset))
        if (typeof parsed !== 'string') {
          throw new Error('Invalid JSON string')
        }
        return parsed
      }
      if (code < 0x20) {
        throw new Error('Invalid JSON string control character')
      }
      if (code === 0x5c) {
        this.offset += 1
        const escape = this.text[this.offset]
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(this.text.slice(this.offset + 1, this.offset + 5))) {
            throw new Error('Invalid JSON unicode escape')
          }
          this.offset += 4
        } else if (!escape || !'"\\/bfnrt'.includes(escape)) {
          throw new Error('Invalid JSON escape')
        }
      }
      this.offset += 1
    }
    throw new Error('Unterminated JSON string')
  }

  private parseNumber(): number {
    const remaining = this.text.slice(this.offset)
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(remaining)
    if (!match) {
      throw new Error('Invalid JSON value')
    }
    this.offset += match[0].length
    const value = Number(match[0])
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
      throw new Error('Unsafe JSON number')
    }
    return value
  }

  private parseLiteral<T>(literal: string, value: T): T {
    if (!this.text.startsWith(literal, this.offset)) {
      throw new Error('Invalid JSON literal')
    }
    this.offset += literal.length
    return value
  }

  private expect(token: string): void {
    if (this.text[this.offset] !== token) {
      throw new Error(`Expected ${token}`)
    }
    this.offset += 1
  }

  private skipWhitespace(): void {
    while (' \t\r\n'.includes(this.text[this.offset] ?? '\0')) {
      this.offset += 1
    }
  }
}

function validateJsonValue(value: unknown): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
      throw new Error('Terminal multiplex JSON contains an unsafe number')
    }
    return
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return
  }
  if (Array.isArray(value)) {
    value.forEach(validateJsonValue)
    return
  }
  if (isJsonObject(value)) {
    Object.values(value).forEach(validateJsonValue)
    return
  }
  throw new Error('Terminal multiplex JSON contains an unsupported value')
}

function isJsonObject(value: unknown): value is TerminalMultiplexJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
