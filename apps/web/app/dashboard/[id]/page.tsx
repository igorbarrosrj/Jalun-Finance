// TODO Fase 7: implementar detalhe do processo com credores ranqueados
export default function ProcessoDetalhePage({ params }: { params: { id: string } }) {
  return (
    <main className='min-h-screen p-8'>
      <h1 className='text-2xl font-bold'>Processo #{params.id}</h1>
      <p className='text-gray-500 mt-2'>Implementação completa na Fase 7.</p>
    </main>
  )
}
