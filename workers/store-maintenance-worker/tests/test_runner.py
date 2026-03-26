from __future__ import annotations

import sys
import types
import unittest
from argparse import Namespace
from unittest.mock import Mock, patch

from workers.store_maintenance_worker import processor
from workers.store_maintenance_worker import runner


def _fake_module(name: str, **attrs):
    module = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(module, key, value)
    return module


class RunnerDispatchTests(unittest.TestCase):
    def test_main_dispatches_import_mode(self):
        args = Namespace(mode="import")
        with patch.object(runner, "parse_args", return_value=args):
            with patch.object(processor, "run_import") as run_import:
                with patch.object(processor, "run_geo_fix") as run_geo_fix:
                    with patch.object(processor, "run_backfill") as run_backfill:
                        runner.main()
        run_import.assert_called_once_with(args)
        run_geo_fix.assert_not_called()
        run_backfill.assert_not_called()

    def test_main_dispatches_geo_fix_mode(self):
        args = Namespace(mode="geo_fix")
        with patch.object(runner, "parse_args", return_value=args):
            with patch.object(processor, "run_import") as run_import:
                with patch.object(processor, "run_geo_fix") as run_geo_fix:
                    with patch.object(processor, "run_backfill") as run_backfill:
                        runner.main()
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
            "workers.store_maintenance_worker.import_new_stores",
            import_new_stores=import_new_stores_mock,
        )
        fake_update_module = _fake_module(
            "workers.store_maintenance_worker.update_target_zipcodes",
            update_target_zipcodes=update_target_zipcodes_mock,
        )

        with patch.dict(
            sys.modules,
            {
                "workers.store_maintenance_worker.import_new_stores": fake_importer,
                "workers.store_maintenance_worker.update_target_zipcodes": fake_update_module,
            },
        ):
            with patch.object(processor.db, "mark_scraping_events_completed", return_value=1) as mark_events:
                processor.run_import(args)

        update_target_zipcodes_mock.assert_called_once_with(add_neighbors=True, neighbor_radius=5)
        import_new_stores_mock.assert_called_once()
        kwargs = import_new_stores_mock.call_args.kwargs
        self.assertEqual(kwargs["brand_filter"], {"target", "walmart"})
        self.assertEqual(kwargs["explicit_target_zipcodes"], {"94102"})
        self.assertFalse(kwargs["use_target_zipcodes"])
        mark_events.assert_called_once_with({"94102"})


if __name__ == "__main__":
    unittest.main()
