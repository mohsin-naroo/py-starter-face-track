# main.py

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles

from deepface import DeepFace
from deepface.commons import distance as verification

import cv2

import os
import time
import numpy

# init api
api = FastAPI()
api.mount("/ui", StaticFiles(directory="static/ui"), name="static")


@api.post("/api/v1/deepface/detect")
def represent(image: UploadFile = File(), model: str = Form("Facenet512")):
    entries = []
    embeddings = []
    # detect faces and embeddings
    try:
        faces = DeepFace.represent(img_path = cv2.imdecode(numpy.fromstring(image.file.read(), numpy.uint8), cv2.IMREAD_COLOR), model_name = model)
    except ValueError as error:
        print('Error: ', error)
        return {'error': error.args}
    # for each face detected
    for face in faces:
        face_area = face['facial_area']
        entries.append({'x': face_area['x'], 'y': face_area['y'], 'width': face_area['w'], 'height': face_area['h']})
        face_embedding = face['embedding']
        embeddings.append(face_embedding)
    return {'entries': entries, 'embeddings': embeddings}


@api.post("/api/v1/deepface/track")
def verify(image: UploadFile = File(), embedding: str = Form(), model: str = Form("Facenet512"), metric: str = Form("euclidean_l2")):
    entries = []
    embeddings = []
    results = []
    # detect faces and embeddings
    try:
        faces = DeepFace.represent(img_path = cv2.imdecode(numpy.fromstring(image.file.read(), numpy.uint8), cv2.IMREAD_COLOR), model_name = model)
    except ValueError as error:
        print('Error: ', error)
        return {'error': error.args}
    # convert embedding str to numpy array
    src_embedding = numpy.fromstring(embedding, sep=',')
    # find threshold
    threshold = verification.findThreshold(model, metric)
    # for each face detected
    for face in faces:
        face_area = face['facial_area']
        entries.append({'x': face_area['x'], 'y': face_area['y'], 'width': face_area['w'], 'height': face_area['h']})
        face_embedding = face['embedding']
        embeddings.append(face_embedding)
        if metric == "cosine":
            distance = verification.findCosineDistance(src_embedding, face_embedding)
        elif metric == "euclidean":
            distance = verification.findEuclideanDistance(src_embedding, face_embedding)
        elif metric == "euclidean_l2":
            distance = verification.findEuclideanDistance(verification.l2_normalize(src_embedding), verification.l2_normalize(face_embedding))
        else:
            metric = "cosine"
            distance = verification.findCosineDistance(src_embedding, face_embedding)
        results.append({"verified": True if distance <= threshold else False, "distance": distance})
    return {'entries': entries, 'embeddings': embeddings, 'results': results, 'threshold': threshold, 'model': model, "metric": metric}
