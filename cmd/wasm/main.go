package main

import (
"dryfour-ar/pkg/ml"
"syscall/js"
"github.com/esimov/pigo/core"
)

var (
classifier *pigo.Pigo
pigoCore   = pigo.NewPigo()
lastX, lastY float64
)

func main() {
c := make(chan struct{}, 0)
js.Global().Set("processarRastreamento", js.FuncOf(processarRastreamento))
js.Global().Set("inicializarDetector", js.FuncOf(inicializarDetector))
<-c
}

func inicializarDetector(this js.Value, args []js.Value) interface{} {
byteData := make([]byte, args[0].Length())
js.CopyBytesToGo(byteData, args[0])
var err error
classifier, err = pigoCore.Unpack(byteData)
if err != nil {
return err.Error()
}
return nil
}

func processarRastreamento(this js.Value, args []js.Value) interface{} {
if classifier == nil {
return map[string]interface{}{"detected": false}
}

// Recebe os pixels da webcam
pixels := make([]uint8, args[0].Length())
js.CopyBytesToGo(pixels, args[0])
rows := args[1].Int()
cols := args[2].Int()

// Converter RGBA para Escala de Cinza (O Pigo exige isso internamente)
// Isso economiza MUITA memória para sua Intel HD Graphics de 32MB
gray := make([]uint8, rows*cols)
for i := 0; i < rows*cols; i++ {
// Fórmula de Luminosidade: Y = 0.299R + 0.587G + 0.114B
gray[i] = uint8(0.299*float64(pixels[i*4]) + 0.587*float64(pixels[i*4+1]) + 0.114*float64(pixels[i*4+2]))
}

// Criando a struct de parâmetros que o seu compilador exigiu
params := pigo.CascadeParams{
MinSize:     100,
MaxSize:     600,
ShiftFactor: 0.1,
ScaleFactor: 1.1,
ImageParams: pigo.ImageParams{
Pixels: gray,
Rows:   rows,
Cols:   cols,
Dim:    cols,
},
}

// Chamada exata para a v1.4.6: RunCascade(params, angle)
dets := classifier.RunCascade(params, 0.0)
dets = classifier.ClusterDetections(dets, 0.2)

if len(dets) > 0 {
newX, newY := float64(dets[0].Col), float64(dets[0].Row)
if ml.ShouldUpdate(lastX, lastY, newX, newY) {
lastX, lastY = newX, newY
return map[string]interface{}{
"x": newX, "y": newY, "detected": true,
}
}
}
return map[string]interface{}{"detected": false}
}
