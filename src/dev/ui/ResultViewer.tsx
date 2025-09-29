type ResultViewerProps = {
  imageUrl: string
  result?: string
}

export const ResultViewer = (props: ResultViewerProps) => {
  return (
    <div className="w-full flex p-2 gap-2">
      <div className="flex-1">
        <img
          src={props.imageUrl}
          width="100%"
        />
      </div>
      <div className="flex-3">
        <div className="whitespace-pre-wrap">{props.result || '-'}</div>
      </div>
    </div>
  )
}
