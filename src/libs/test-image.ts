const imgs = import.meta.glob('@/assets/test-image/*', {
  import: 'default',
})

export const getTestImages = async (): Promise<string[]> => {
  return Promise.all(
    Object.values(imgs).map(async (load) => {
      return (await load()) as string
    }),
  )
}
