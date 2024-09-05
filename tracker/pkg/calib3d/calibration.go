package calib3d

import (
	"encoding/base64"
	"encoding/json"
	"image"

	"gocv.io/x/gocv"
)

var (
	absoluteCornersLocations = gocv.NewPointVectorFromPoints([]image.Point{
		{X: 0, Y: 0},
		{X: 1, Y: 0},
		{X: 0, Y: 1},
		{X: 1, Y: 1},
	})
)

type PoseCalibration struct {
	FoundCorners []int32
	Corners      gocv.Point2fVector
	CameraMatrix gocv.Mat
	DistCoeffs   gocv.Mat
	RVecs        gocv.Mat
	TVecs        gocv.Mat

	homographyMat gocv.Mat
}

type poseCalibrationMarshal struct {
	Corners      [][]float32    `json:"corners"`
	CameraMatrix marshalableMat `json:"cameraMatrix"`
	DistCoeffs   marshalableMat `json:"distCoeffs"`
	RVecs        marshalableMat `json:"rVecs"`
	TVecs        marshalableMat `json:"tVecs"`
}

func (p *PoseCalibration) Close() {
	p.CameraMatrix.Close()
	p.DistCoeffs.Close()
	p.RVecs.Close()
	p.TVecs.Close()
	p.homographyMat.Close()
}

func (p *PoseCalibration) calculateHomographyMat() {
	cornersPoints := make([]image.Point, p.Corners.Size())
	for i, c := range p.Corners.ToPoints() {
		cornersPoints[i] = image.Point{X: int(c.X), Y: int(c.Y)}
	}

	cornersLocations := gocv.NewPointVectorFromPoints(cornersPoints)
	defer cornersLocations.Close()

	p.homographyMat = gocv.GetPerspectiveTransform(cornersLocations, absoluteCornersLocations)
}

func (p *PoseCalibration) MarshalJSON() ([]byte, error) {
	corners := make([][]float32, p.Corners.Size())
	for i, c := range p.Corners.ToPoints() {
		corners[i] = []float32{c.X, c.Y}
	}

	return json.Marshal(&poseCalibrationMarshal{
		Corners:      corners,
		CameraMatrix: MarshalMat(&p.CameraMatrix),
		DistCoeffs:   MarshalMat(&p.DistCoeffs),
		RVecs:        MarshalMat(&p.RVecs),
		TVecs:        MarshalMat(&p.TVecs),
	})
}

func (p *PoseCalibration) UnmarshalJSON(data []byte) error {
	var pm poseCalibrationMarshal
	if err := json.Unmarshal(data, &pm); err != nil {
		return err
	}

	corners := make([]gocv.Point2f, len(pm.Corners))
	for i, c := range pm.Corners {
		corners[i].X = c[0]
		corners[i].Y = c[1]
	}
	p.Corners = gocv.NewPoint2fVectorFromPoints(corners)

	cm, err := ToMat(&pm.CameraMatrix)
	if err != nil {
		return err
	}
	p.CameraMatrix = cm

	dc, err := ToMat(&pm.DistCoeffs)
	if err != nil {
		return err
	}
	p.DistCoeffs = dc

	rv, err := ToMat(&pm.RVecs)
	if err != nil {
		return err
	}
	p.RVecs = rv

	tv, err := ToMat(&pm.TVecs)
	if err != nil {
		return err
	}
	p.TVecs = tv

	p.calculateHomographyMat()

	return nil
}

type marshalableMat struct {
	Rows       int    `json:"rows"`
	Cols       int    `json:"cols"`
	Type       int    `json:"type"`
	DataBase64 string `json:"data"`
}

func MarshalMat(mat *gocv.Mat) marshalableMat {
	return marshalableMat{
		Rows:       mat.Rows(),
		Cols:       mat.Cols(),
		Type:       int(mat.Type()),
		DataBase64: base64.StdEncoding.EncodeToString(mat.ToBytes()),
	}
}

func ToMat(m *marshalableMat) (gocv.Mat, error) {
	data, _ := base64.StdEncoding.DecodeString(m.DataBase64)
	if len(data) == 0 {
		return gocv.NewMat(), nil
	}
	return gocv.NewMatFromBytes(m.Rows, m.Cols, gocv.MatType(m.Type), data)
}
