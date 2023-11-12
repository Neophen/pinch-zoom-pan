
import { renderer } from './renderer'

type InstanceState = 'idle' | 'singleGesture' | 'multiGesture' | 'mouse'

const MIN_SCALE = 1
const MAX_SCALE = 4
const DOUBLE_TAP_TIME = 185 // milliseconds

const stateIs = (state: InstanceState, ...states: InstanceState[]) => states.includes(state)

const getPinchDistance = (event: TouchEvent): number =>
  Math.hypot(event.touches[0].pageX - event.touches[1].pageX, event.touches[0].pageY - event.touches[1].pageY)

const getMidPoint = (event: TouchEvent): { x: number; y: number } => ({
  x: (event.touches[0].pageX + event.touches[1].pageX) / 2,
  y: (event.touches[0].pageY + event.touches[1].pageY) / 2
})

const onDoubleTap = ({
  instance,
  scale,
  x,
  y
}: {
  instance: ReturnType<typeof renderer>
  scale: number
  x: number
  y: number
}): number => {
  if (scale < MAX_SCALE) {
    instance.zoomTo({ newScale: MAX_SCALE, x, y })
    return MAX_SCALE
  } else {
    instance.reset()
    return MIN_SCALE
  }
}

export const addZoomPan = ({ container, image }: { container: HTMLElement; image: HTMLImageElement }) => {
  let state: InstanceState = 'idle'

  let scaleValue = 1;
  const currentScale = () => scaleValue
  const setCurrentScale = (value: number) => {
    scaleValue = value
    container.style.cursor = value === MIN_SCALE ? 'zoom-in' : 'move'
  }

  let lastTapTime = 0
  let deviceHasTouch = false
  let wheelTimeout: ReturnType<typeof setTimeout> | undefined

  const start: { x: number; y: number; distance: number; touches: Touch[] } = {
    x: 0,
    y: 0,
    distance: 0,
    touches: []
  }

  const instance = renderer({
    container,
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
    element: image,
    scaleSensitivity: 20
  })

  const onStart = (event: TouchEvent) => {
    deviceHasTouch = true

    if (stateIs(state, 'multiGesture')) return

    const touchCount = event.touches.length

    if (touchCount === 2 && stateIs(state, 'idle', 'singleGesture')) {
      const { x, y } = getMidPoint(event)

      start.x = x
      start.y = y
      start.distance = getPinchDistance(event) / currentScale()
      start.touches = [event.touches[0], event.touches[1]]

      lastTapTime = 0 // Reset to prevent misinterpretation as a double tap
      state = 'multiGesture'
      return
    }

    if (touchCount !== 1) {
      state = 'idle'
      return
    }

    state = 'singleGesture'

    const [touch] = event.touches

    start.x = touch.pageX
    start.y = touch.pageY
    start.distance = 0
    start.touches = [touch]
  }

  const onMove = (event: TouchEvent) => {
    if (stateIs(state, 'idle')) return

    const touchCount = event.touches.length

    if (stateIs(state, 'multiGesture') && touchCount === 2) {
      event.preventDefault()
      const scale = getPinchDistance(event) / start.distance

      const { x, y } = getMidPoint(event)

      instance.zoomPan({ scale, x, y, deltaX: x - start.x, deltaY: y - start.y })

      start.x = x
      start.y = y
      return
    }

    if (
      currentScale() === MIN_SCALE ||
      !stateIs(state, 'singleGesture') ||
      touchCount !== 1 ||
      event.touches[0]?.identifier !== start.touches[0]?.identifier
    ) {
      return
    }
    event.preventDefault()

    const [touch] = event.touches

    const deltaX = touch.pageX - start.x
    const deltaY = touch.pageY - start.y

    instance.panBy({ originX: deltaX, originY: deltaY })

    start.x = touch.pageX
    start.y = touch.pageY
  }

  const onEndTouch = (event: TouchEvent) => {
    if (stateIs(state, 'idle') || event.touches.length !== 0) {
      return
    }

    const currentTime = new Date().getTime()
    const tapLength = currentTime - lastTapTime

    if (tapLength < DOUBLE_TAP_TIME && tapLength > 0) {
      event.preventDefault()
      const [touch] = event.changedTouches
      if (!touch) return
      setCurrentScale(onDoubleTap({ instance, scale: currentScale(), x: touch.clientX, y: touch.clientY }))
    }

    lastTapTime = currentTime
    setCurrentScale(instance.getScale())
    state = 'idle'
  }

  const onWheel = (event: WheelEvent) => {
    if (deviceHasTouch) return
    event.preventDefault()
    instance.zoom({
      deltaScale: Math.sign(event.deltaY) > 0 ? -1 : 1,
      x: event.pageX,
      y: event.pageY
    })

    clearTimeout(wheelTimeout)
    wheelTimeout = setTimeout(() => {
      setCurrentScale(instance.getScale())
    }, 100)
  }

  const onMouseMove = (event: MouseEvent) => {
    if (deviceHasTouch) return
    if (event.buttons !== 1 || currentScale() === MIN_SCALE) {
      return
    }
    event.preventDefault()

    if (event.movementX === 0 && event.movementY === 0) {
      return
    }

    state = 'mouse'

    instance.panBy({ originX: event.movementX, originY: event.movementY })
  }

  const onMouseEnd = () => {
    if (deviceHasTouch) return
    state = 'idle'
    setCurrentScale(instance.getScale())
  }

  const onMouseUp = (event: MouseEvent) => {
    if (deviceHasTouch) return
    if (!stateIs(state, 'mouse')) {
      setCurrentScale(onDoubleTap({ instance, scale: currentScale(), x: event.pageX, y: event.pageY }))
    }
    onMouseEnd()
  }

  container.addEventListener('touchstart', onStart, { passive: false })
  container.addEventListener('touchmove', onMove, { passive: false })
  container.addEventListener('touchend', onEndTouch, { passive: false })
  container.addEventListener('touchcancel', onEndTouch, { passive: false })

  container.addEventListener('mousemove', onMouseMove, { passive: false })
  container.addEventListener('mouseup', onMouseUp, { passive: false })
  container.addEventListener('mouseleave', onMouseEnd, { passive: false })
  container.addEventListener('mouseout', onMouseEnd, { passive: false })
  container.addEventListener('wheel', onWheel, { passive: false })

  const reset = () => {
    state = 'idle'
    setCurrentScale(1)
    lastTapTime = 0

    start.x = 0
    start.y = 0
    start.distance = 0
    start.touches = []

    instance.reset()
  }

  const destroy = () => {
    container.removeEventListener('touchstart', onStart)
    container.removeEventListener('touchmove', onMove)
    container.removeEventListener('touchend', onEndTouch)
    container.removeEventListener('touchcancel', onEndTouch)

    container.removeEventListener('mousemove', onMouseMove)
    container.removeEventListener('mouseup', onMouseUp)
    container.removeEventListener('mouseleave', onMouseEnd)
    container.removeEventListener('mouseout', onMouseEnd)
    container.removeEventListener('wheel', onWheel)
  }

  return {
    reset,
    destroy
  }
}
