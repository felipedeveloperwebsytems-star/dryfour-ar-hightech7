package ml
import "math"
func ShouldUpdate(lastX, lastY, newX, newY float64) bool {
    dist := math.Sqrt(math.Pow(newX-lastX, 2) + math.Pow(newY-lastY, 2))
    return dist > 4.0
}
