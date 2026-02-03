
import cv2
import numpy as np
import sys
import json

def sift_match(img1_path, img2_path):
    try:
        # Read images
        img1 = cv2.imread(img1_path, cv2.IMREAD_GRAYSCALE)
        img2 = cv2.imread(img2_path, cv2.IMREAD_GRAYSCALE)

        if img1 is None or img2 is None:
            return {"error": "Could not read images"}

        # Initialize SIFT detector
        sift = cv2.SIFT_create()

        # Find keypoints and descriptors
        kp1, des1 = sift.detectAndCompute(img1, None)
        kp2, des2 = sift.detectAndCompute(img2, None)

        if des1 is None or des2 is None:
             return {"score": 0, "matches": 0, "keypoints1": len(kp1), "keypoints2": len(kp2)}

        # FLANN parameters
        FLANN_INDEX_KDTREE = 1
        index_params = dict(algorithm=FLANN_INDEX_KDTREE, trees=5)
        search_params = dict(checks=50)

        flann = cv2.FlannBasedMatcher(index_params, search_params)

        matches = flann.knnMatch(des1, des2, k=2)

        # Ratio test
        good = []
        for m, n in matches:
            if m.distance < 0.7 * n.distance:
                good.append(m)

        # Calculate score
        # A simple score is the number of good matches relative to the keypoints found.
        # But for robustness, we might want to check homography inliers if matches > 4.
        
        inliers = 0
        if len(good) > 4:
            src_pts = np.float32([kp1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
            dst_pts = np.float32([kp2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)

            M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
            if mask is not None:
                matchesMask = mask.ravel().tolist()
                inliers = np.sum(matchesMask)
            else:
                inliers = 0
        else:
            inliers = len(good)

        # Normalize score
        # Inliers ratio relative to the minimum number of keypoints in either image
        min_kp = min(len(kp1), len(kp2))
        if min_kp == 0:
             score = 0
        else:
             # score = min(1.0, inliers / (min_kp * 0.2 + 5)) 
             
             # Let's adjust for demo. 
             # If inliers > 20, it's usually a good match for small objects/scenes.
             # If inliers > 50, it's excellent.
             
             # Let's try sigmoid-like function:
             # score = inliers / (inliers + 20)
             # if inliers=20, score=0.5. if inliers=50, score=0.71. if inliers=100, score=0.83.
             
             score = inliers / (inliers + 15)

        return {
            "score": float(score),
            "inliers": int(inliers),
            "good_matches": len(good),
            "keypoints1": len(kp1),
            "keypoints2": len(kp2)
        }

    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python sift_match.py <img1> <img2>"}))
        sys.exit(1)
        
    result = sift_match(sys.argv[1], sys.argv[2])
    print(json.dumps(result))
