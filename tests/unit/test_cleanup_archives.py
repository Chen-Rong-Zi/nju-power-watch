"""
Tests for cleanup_archives.py script.
"""
import pytest
import tarfile
import json
from pathlib import Path
from datetime import datetime, timedelta
from scripts.cleanup_archives import (
    archive_month,
    verify_archive,
    delete_old_archives
)


class TestArchiveCreation:
    """Test cases for archive creation."""
    
    def test_archive_creates_tar_gz(self, temp_database, tmp_path):
        """Test that archive creates valid tar.gz file."""
        archive_dir = tmp_path / "archives"
        archive_dir.mkdir()
        
        # Create test data
        today = datetime.now()
        old_date = today - timedelta(days=35)
        old_date_str = old_date.strftime("%Y%m%d")
        
        campus_dir = temp_database / "仙林校区" / "19幢" / "19栋第16层1613-53463"
        campus_dir.mkdir(parents=True, exist_ok=True)
        
        old_file = campus_dir / f"{old_date_str}.json"
        with open(old_file, 'w', encoding='utf-8') as f:
            json.dump({"test": "data"}, f)
        
        # Create archive
        archive_path = archive_month(str(temp_database), old_date.year, old_date.month, str(archive_dir))
        
        assert archive_path.exists()
        assert archive_path.suffix == '.gz'
        assert tarfile.is_tarfile(str(archive_path))
    
    def test_archive_includes_manifest(self, temp_database, tmp_path):
        """Test that archive includes manifest.json."""
        archive_dir = tmp_path / "archives"
        archive_dir.mkdir()
        
        today = datetime.now()
        old_date = today - timedelta(days=35)
        old_date_str = old_date.strftime("%Y%m%d")
        
        campus_dir = temp_database / "仙林校区" / "19幢" / "19栋第16层1613-53463"
        campus_dir.mkdir(parents=True, exist_ok=True)
        
        old_file = campus_dir / f"{old_date_str}.json"
        with open(old_file, 'w', encoding='utf-8') as f:
            json.dump({"test": "data"}, f)
        
        archive_path = archive_month(str(temp_database), old_date.year, old_date.month, str(archive_dir))
        
        # Extract and check manifest
        with tarfile.open(archive_path, 'r:gz') as tar:
            manifest_exists = any('manifest.json' in member.name for member in tar.getmembers())
        
        assert manifest_exists
    
    def test_archive_only_includes_target_month(self, temp_database, tmp_path):
        """Test that archive only includes files from target month."""
        archive_dir = tmp_path / "archives"
        archive_dir.mkdir()
        
        campus_dir = temp_database / "仙林校区" / "19幢" / "19栋第16层1613-53463"
        campus_dir.mkdir(parents=True, exist_ok=True)
        
        # Create files for different months
        target_month_file = campus_dir / "20260515.json"
        other_month_file = campus_dir / "20260415.json"
        
        with open(target_month_file, 'w') as f:
            json.dump({"month": "may"}, f)
        with open(other_month_file, 'w') as f:
            json.dump({"month": "april"}, f)
        
        archive_path = archive_month(str(temp_database), 2026, 5, str(archive_dir))
        
        with tarfile.open(archive_path, 'r:gz') as tar:
            members = tar.getnames()
        
        # Should include May file but not April
        assert any('20260515.json' in m for m in members)
        assert not any('20260415.json' in m for m in members)


class TestArchiveVerification:
    """Test cases for archive verification."""
    
    def test_verify_valid_archive(self, temp_database, tmp_path):
        """Test that valid archive passes verification."""
        archive_dir = tmp_path / "archives"
        archive_dir.mkdir()
        
        campus_dir = temp_database / "仙林校区" / "19幢" / "19栋第16层1613-53463"
        campus_dir.mkdir(parents=True, exist_ok=True)
        
        old_file = campus_dir / "20260515.json"
        with open(old_file, 'w') as f:
            json.dump({"test": "data"}, f)
        
        archive_path = archive_month(str(temp_database), 2026, 5, str(archive_dir))
        
        # Should not raise exception
        result = verify_archive(str(archive_path))
        assert result is True
    
    def test_verify_empty_archive_raises_error(self, tmp_path):
        """Test that empty archive raises ValueError."""
        archive_path = tmp_path / "empty.tar.gz"
        
        # Create empty archive
        with tarfile.open(archive_path, 'w:gz') as tar:
            pass
        
        with pytest.raises(ValueError, match="empty"):
            verify_archive(str(archive_path))
    
    def test_verify_corrupt_archive_raises_error(self, tmp_path):
        """Test that corrupt archive raises error."""
        archive_path = tmp_path / "corrupt.tar.gz"
        
        # Write invalid data
        with open(archive_path, 'wb') as f:
            f.write(b"not a valid tar file")
        
        with pytest.raises(Exception):
            verify_archive(str(archive_path))


class TestDeleteOldArchives:
    """Test cases for deleting old archives."""
    
    def test_delete_archives_older_than_retention(self, tmp_path):
        """Test that archives older than retention period are deleted."""
        archive_dir = tmp_path / "archives"
        archive_dir.mkdir()
        
        # Create old archive
        old_archive = archive_dir / "2025-05.tar.gz"
        old_archive.touch()
        
        # Set old modification time
        import os
        old_time = (datetime.now() - timedelta(days=400)).timestamp()
        os.utime(old_archive, (old_time, old_time))
        
        # Create recent archive
        recent_archive = archive_dir / "2026-04.tar.gz"
        recent_archive.touch()
        
        deleted_count = delete_old_archives(str(archive_dir), days=365)
        
        assert deleted_count == 1
        assert not old_archive.exists()
        assert recent_archive.exists()
    
    def test_delete_preserves_recent_archives(self, tmp_path):
        """Test that recent archives are not deleted."""
        archive_dir = tmp_path / "archives"
        archive_dir.mkdir()
        
        # Create recent archives
        for month in ["2026-03", "2026-04", "2026-05"]:
            archive_file = archive_dir / f"{month}.tar.gz"
            archive_file.touch()
        
        deleted_count = delete_old_archives(str(archive_dir), days=365)
        
        assert deleted_count == 0
        assert len(list(archive_dir.glob("*.tar.gz"))) == 3
    
    def test_delete_handles_empty_directory(self, tmp_path):
        """Test that deletion handles empty archive directory."""
        archive_dir = tmp_path / "archives"
        archive_dir.mkdir()
        
        deleted_count = delete_old_archives(str(archive_dir), days=365)
        
        assert deleted_count == 0
