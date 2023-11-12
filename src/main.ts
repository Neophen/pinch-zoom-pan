import './style.css'

import { addZoomPan } from "./preview";

const container = document.getElementById('container')!
const image = document.getElementById('image') as HTMLImageElement

addZoomPan({ container, image })
