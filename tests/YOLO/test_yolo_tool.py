# 验证 YOLO 过滤计数与不支持类别的处理。
# Created on 2026-09-14
# @author: https://github.com/Linmoqian

import unittest

from yolo_tool import summarize_detections


class SummaryTests(unittest.TestCase):
    def test_count(self):
        result = summarize_detections(
            [{"class_name": "豆荚", "confidence": 0.9}] * 26
            + [{"class_name": "豆荚", "confidence": 0.1},
               {"class_name": "leaf", "confidence": 0.9}],
            ["豆荚", "leaf"],
            "豆荚",
            0.5
        )
        self.assertEqual(result["count"], 26)
        self.assertIn("豆荚 26 个", result["message"])
        self.assertNotIn("detections", result)

    def test_unsupported(self):
        result = summarize_detections([], ["person"], "豆荚", 0.5)
        self.assertFalse(result["ok"])
        self.assertNotIn("count", result)

    def test_zero(self):
        result = summarize_detections([], ["豆荚"], "豆荚", 0.5)
        self.assertEqual(result["count"], 0)

    def test_invalid_threshold(self):
        for threshold in (-1, 2, float("nan")):
            with self.assertRaises(ValueError):
                summarize_detections([], [], None, threshold)

    def test_all_classes(self):
        result = summarize_detections(
            [{"class_name": "person", "confidence": 0.5}],
            ["person"],
            None,
            0.5
        )
        self.assertEqual(result["count"], 1)


if __name__ == "__main__":
    unittest.main()
