#!/usr/bin/env python3
"""Tests for simulator selection without requiring CoreSimulator."""

import importlib.util
from pathlib import Path
import unittest


SCRIPT = Path(__file__).with_name("select-simulator.py")
SPEC = importlib.util.spec_from_file_location("select_simulator", SCRIPT)
assert SPEC and SPEC.loader
select_simulator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(select_simulator)


class SimulatorSelectionTests(unittest.TestCase):
    def test_prefers_newest_available_runtime(self) -> None:
        devices = {
            "devices": {
                "com.apple.CoreSimulator.SimRuntime.iOS-18-5": [
                    {
                        "name": "iPhone 16 Pro",
                        "udid": "COMPATIBLE",
                        "state": "Shutdown",
                        "isAvailable": True,
                    }
                ],
                "com.apple.CoreSimulator.SimRuntime.iOS-26-2": [
                    {
                        "name": "iPhone 17 Pro",
                        "udid": "NEWEST",
                        "state": "Shutdown",
                        "isAvailable": True,
                    }
                ],
            }
        }

        chosen = select_simulator.choose_device(devices, "iPhone")

        self.assertEqual(chosen["udid"], "NEWEST")
        self.assertEqual(chosen["runtime_version"], (26, 2))

    def test_prefers_an_already_booted_device_in_selected_runtime(self) -> None:
        devices = {
            "devices": {
                "com.apple.CoreSimulator.SimRuntime.iOS-18-5": [
                    {
                        "name": "iPhone 16 Pro",
                        "udid": "SHUTDOWN",
                        "state": "Shutdown",
                        "isAvailable": True,
                    },
                    {
                        "name": "iPhone 15",
                        "udid": "BOOTED",
                        "state": "Booted",
                        "isAvailable": True,
                    },
                ]
            }
        }

        chosen = select_simulator.choose_device(devices, "iPhone")

        self.assertEqual(chosen["udid"], "BOOTED")


if __name__ == "__main__":
    unittest.main()
