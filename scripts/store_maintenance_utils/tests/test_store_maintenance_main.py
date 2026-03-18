from __future__ import annotations

import sys
import types
import unittest
from argparse import Namespace
from pathlib import Path
from unittest.mock import Mock, patch


SCRIPTS_DIR = Path(__file__).resolve().parents[2]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import store_maintenance as maintenance  # noqa: E402


def _fake_module(name: str, **attrs):
    module = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(module, key, value)
    return module


class StoreMaintenanceMainTests(unittest.TestCase):
    def test_main_dispatches_import_mode(self):
        args = Namespace(mode="import")
        with patch.object(maintenance, "_parse_args", return_value=args):
            with patch.object(maintenance, "_run_import") as run_import:
                with patch.object(maintenance, "_run_geo_fix") as run_geo_fix:
                    with patch.object(maintenance, "_run_backfill") as run_backfill:
                        maintenance.main()
        run_import.assert_called_once_with(args)
        run_geo_fix.assert_not_called()
        run_backfill.assert_not_called()

    def test_main_dispatches_geo_fix_mode(self):
        args = Namespace(mode="geo_fix")
        with patch.object(maintenance, "_parse_args", return_value=args):
            with patch.object(maintenance, "_run_import") as run_import:
                with patch.object(maintenance, "_run_geo_fix") as run_geo_fix:
                    with patch.object(maintenance, "_run_backfill") as run_backfill:
                        maintenance.main()
        run_import.assert_not_called()
        run_geo_fix.assert_called_once_with(args)
        run_backfill.assert_not_called()

    def test_run_import_continues_if_update_target_zipcodes_fails(self):
        args = Namespace(
            brands="target,walmart",
            max_spiders=2,
            zip=["94102"],
            zipcodes=None,
            run_update_target_zipcodes="true",
            neighbor_radius=5,
            import_all_zipcodes=False,
            mark_events_completed="true",
        )

        import_new_stores_mock = Mock()
        update_target_zipcodes_mock = Mock(side_effect=RuntimeError("boom"))
        fake_importer = _fake_module(
            "store_maintenance_utils.import_new_stores",
            import_new_stores=import_new_stores_mock,
        )
        fake_update_module = _fake_module(
            "update_target_zipcodes",
            update_target_zipcodes=update_target_zipcodes_mock,
        )

        with patch.dict(
            sys.modules,
            {
                "store_maintenance_utils.import_new_stores": fake_importer,
                "update_target_zipcodes": fake_update_module,
            },
        ):
            with patch.object(maintenance.common, "mark_scraping_events_completed", return_value=1) as mark_events:
                maintenance._run_import(args)

        update_target_zipcodes_mock.assert_called_once_with(add_neighbors=True, neighbor_radius=5)
        import_new_stores_mock.assert_called_once()
        kwargs = import_new_stores_mock.call_args.kwargs
        self.assertEqual(kwargs["brand_filter"], {"target", "walmart"})
        self.assertEqual(kwargs["explicit_target_zipcodes"], {"94102"})
        self.assertFalse(kwargs["use_target_zipcodes"])
        mark_events.assert_called_once_with({"94102"})


if __name__ == "__main__":
    unittest.main()
