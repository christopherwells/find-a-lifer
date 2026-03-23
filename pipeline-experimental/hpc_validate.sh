#!/bin/bash
#SBATCH --job-name=fal-validate
#SBATCH --time=00:30:00
#SBATCH --mem=4G
#SBATCH --cpus-per-task=1
#SBATCH --output=logs/validate.out
#SBATCH --error=logs/validate.err

# HPC Validation Script
# Runs 4 representative combinations on the test subset to verify
# the code works before committing to 512 full runs.
#
# Usage:
#   sbatch hpc_validate.sh
#
# Expected runtime: <5 minutes
# Expected output: 4 JSON files in results/test/

mkdir -p logs

echo "=== HPC Validation Test ==="
echo "Python: $(python --version)"
echo "NumPy: $(python -c 'import numpy; print(numpy.__version__)')"
echo "SciPy: $(python -c 'import scipy; print(scipy.__version__)' 2>/dev/null || echo 'NOT INSTALLED')"
echo "Sklearn: $(python -c 'import sklearn; print(sklearn.__version__)' 2>/dev/null || echo 'NOT INSTALLED')"
echo ""

# Combo 0: baseline (no flags)
echo "--- Combo 0: Baseline ---"
python run_factorial.py --combo 0 --block test
echo ""

# Combo 8: recency_weight only (the simplest improvement)
echo "--- Combo 8: Recency Weight ---"
python run_factorial.py --combo 8 --block test
echo ""

# Combo 64: occupancy_correction only (requires scipy)
echo "--- Combo 64: Occupancy Correction ---"
python run_factorial.py --combo 64 --block test
echo ""

# Combo 256: effort_debiasing only (requires sklearn)
echo "--- Combo 256: Effort Debiasing ---"
python run_factorial.py --combo 256 --block test
echo ""

# Aggregate
echo "--- Aggregating ---"
python run_factorial.py --aggregate --block test

echo ""
echo "=== Validation Complete ==="
echo "Check results/test/ for output files"
ls -la results/test/combo_*.json 2>/dev/null | wc -l
echo "JSON files generated"
