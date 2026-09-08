import requests

URL = "http://127.0.0.1:5005/predict"

with open("./test.jpg", "rb") as f:

    response = requests.post(
        URL,
        files={
            "file": f
        }
    )

print(response.json())