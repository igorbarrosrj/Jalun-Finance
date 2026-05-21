// TODO Fase 7: implementar landing com stats reais do banco
export default function HomePage() {
  return (
    <main className='min-h-screen flex flex-col items-center justify-center bg-white px-4'>
      <div className='max-w-2xl text-center space-y-6'>
        <h1 className='text-4xl font-bold tracking-tight text-gray-900'>
          Credor Radar
        </h1>
        <p className='text-xl text-gray-600'>
          Inteligência de créditos em recuperação judicial
        </p>
        <p className='text-base text-gray-500'>
          Identificamos automaticamente créditos atrativos em processos de RJ
          no Brasil antes do mercado.
        </p>
        <a
          href='/dashboard'
          className='inline-flex items-center justify-center rounded-md bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors'
        >
          Acessar dashboard
        </a>
      </div>
    </main>
  )
}
