import pino from 'pino'

const logLevel = process.env['LOG_LEVEL'] ?? 'info'
const isDev = process.env['NODE_ENV'] !== 'production'

export const logger = pino({
  level: logLevel,
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
    },
  }),
})
