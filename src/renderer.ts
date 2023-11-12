type State = {
  container: HTMLElement
  element: HTMLElement
  minScale: number
  maxScale: number
  scaleSensitivity: number
  accumulatedDeltaScale: number
  transform: {
    originOffset: boolean
    originX: number
    originY: number
    translateX: number
    translateY: number
    scale: number
  }
}

const DEFAULT_TRANSFORMATION = {
  originOffset: false,
  originX: 0,
  originY: 0,
  translateX: 0,
  translateY: 0,
  scale: 1
}

const hasPositionChanged = ({ pos, prevPos }: { pos: number; prevPos: number }) => pos !== prevPos

const valueInRange = ({ minScale, maxScale, transform: { scale } }: State) => scale <= maxScale && scale >= minScale

const getTranslate =
  (state: State) =>
  ({ pos, axis }: { pos: number; axis: 'x' | 'y' }) => {
    const { originX, originY, translateX, translateY, scale } = state.transform
    const axisIsX = axis === 'x'
    const prevPos = axisIsX ? originX : originY
    const translate = axisIsX ? translateX : translateY

    return valueInRange(state) && hasPositionChanged({ pos, prevPos })
      ? translate + (pos - prevPos * scale) * (1 - 1 / scale)
      : translate
  }

const getMatrix = ({ scale, translateX, translateY }: { scale: number; translateX: number; translateY: number }) =>
  `matrix(${scale}, 0, 0, ${scale}, ${translateX}, ${translateY})`

const clamp = (value: number, min: number, max: number) => Math.max(Math.min(value, max), min)

const getNewScale = (deltaScale: number, { transform: { scale }, minScale, maxScale, scaleSensitivity }: State) => {
  const newScale = scale + deltaScale / (scaleSensitivity / scale)
  return clamp(newScale, minScale, maxScale)
}

const clampedTranslate = ({ axis, translate, state }: { axis: 'x' | 'y'; translate: number; state: State }) => {
  const { scale, originX, originY } = state.transform
  const axisIsX = axis === 'x'
  const origin = axisIsX ? originX : originY
  const axisKey = axisIsX ? 'offsetWidth' : 'offsetHeight'

  const containerSize = state.container[axisKey]
  const imageSize = state.element[axisKey]
  const bounds = state.element.getBoundingClientRect()

  const imageScaledSize = axisIsX ? bounds.width : bounds.height

  const defaultOrigin = imageSize / 2
  const originOffset = (origin - defaultOrigin) * (scale - 1)

  const range = Math.max(0, Math.round(imageScaledSize) - containerSize)

  const max = Math.round(range / 2)
  const min = 0 - max

  return clamp(translate, min + originOffset, max + originOffset)
}

const renderClamped = ({ state, translateX, translateY }: { state: State; translateX: number; translateY: number }) => {
  const { originX, originY, scale } = state.transform
  state.transform.translateX = clampedTranslate({ axis: 'x', translate: translateX, state })
  state.transform.translateY = clampedTranslate({ axis: 'y', translate: translateY, state })

  requestAnimationFrame(() => {
    if (state.transform.originOffset) {
      state.element.style.transformOrigin = `${originX}px ${originY}px`
    }
    state.element.style.transform = getMatrix({
      scale,
      translateX: state.transform.translateX,
      translateY: state.transform.translateY
    })
  })
}

const pan = (state: State, { originX, originY }: { originX: number; originY: number }) => {
  renderClamped({
    state,
    translateX: state.transform.translateX + originX,
    translateY: state.transform.translateY + originY
  })
}

const canPan = (state: State) => ({
  panBy: (origin: { originX: number; originY: number }) => pan(state, origin),
  panTo: ({ originX, originY, scale }: { originX: number; originY: number; scale: number }) => {
    state.transform.scale = clamp(scale, state.minScale, state.maxScale)

    pan(state, {
      originX: originX - state.transform.translateX,
      originY: originY - state.transform.translateY
    })
  }
})

const canZoom = (state: State) => ({
  zoomPan: ({
    scale: scaleValue,
    x,
    y,
    deltaX,
    deltaY
  }: {
    scale: number
    x: number
    y: number
    deltaX: number
    deltaY: number
  }) => {
    const {
      minScale,
      maxScale,
      transform: { scale }
    } = state
    const newScale = clamp(scaleValue, minScale, maxScale)
    const { left, top } = state.element.getBoundingClientRect()
    const originX = x - left
    const originY = y - top
    const newOriginX = originX / scale
    const newOriginY = originY / scale
    const translate = getTranslate(state)
    const translateX = translate({ pos: originX, axis: 'x' })
    const translateY = translate({ pos: originY, axis: 'y' })

    state.transform = {
      originOffset: true,
      originX: newOriginX,
      originY: newOriginY,
      translateX,
      translateY,
      scale: newScale
    }

    pan(state, { originX: deltaX, originY: deltaY })
  },
  zoom: ({ x, y, deltaScale }: { x: number; y: number; deltaScale: number }) => {
    const {
      element,
      transform: { scale }
    } = state
    const { left, top } = element.getBoundingClientRect()
    const newScale = getNewScale(deltaScale, state)
    const originX = x - left
    const originY = y - top
    const newOriginX = originX / scale
    const newOriginY = originY / scale

    const translate = getTranslate(state)
    const translateX = translate({ pos: originX, axis: 'x' })
    const translateY = translate({ pos: originY, axis: 'y' })

    state.transform = {
      ...state.transform,
      originOffset: true,
      originX: newOriginX,
      originY: newOriginY,
      scale: newScale
    }

    renderClamped({ state, translateX, translateY })
  },
  zoomTo: ({ newScale, x, y }: { newScale: number; x: number; y: number }) => {
    const {
      element,
      transform: { scale }
    } = state

    const { left, top } = element.getBoundingClientRect()
    const originX = x - left
    const originY = y - top
    const newOriginX = originX / scale
    const newOriginY = originY / scale

    const translate = getTranslate(state)
    const translateX = translate({ pos: originX, axis: 'x' })
    const translateY = translate({ pos: originY, axis: 'y' })

    state.transform = {
      originOffset: true,
      originX: newOriginX,
      originY: newOriginY,
      scale: newScale,
      translateX,
      translateY
    }

    requestAnimationFrame(() => {
      state.element.style.transformOrigin = `${newOriginX}px ${newOriginY}px`
      state.element.style.transform = getMatrix({
        scale: newScale,
        translateX,
        translateY
      })
    })
  }
})

const canInspect = (state: State) => ({
  getScale: () => state.transform.scale,
  reset: () => {
    state.transform.scale = state.minScale
    pan(state, { originX: 0, originY: 0 })
    state.transform = DEFAULT_TRANSFORMATION
  },
  getState: () => state
})

export const renderer = ({
  minScale,
  maxScale,
  element,
  container,
  scaleSensitivity = 10
}: {
  container: HTMLElement
  element: HTMLElement
  minScale: number
  maxScale: number
  scaleSensitivity?: number
}) => {
  const state: State = {
    container,
    element,
    minScale,
    maxScale,
    scaleSensitivity,
    accumulatedDeltaScale: 0,
    transform: DEFAULT_TRANSFORMATION
  }

  return {
    ...canZoom(state),
    ...canPan(state),
    ...canInspect(state)
  }
}
