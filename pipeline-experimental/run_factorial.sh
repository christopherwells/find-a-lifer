#!/bin/bash
#SBATCH --job-name=fal-factorial
#SBATCH --array=0-511
#SBATCH --time=01:00:00
#SBATCH --mem=8G
#SBATCH --cpus-per-task=1
#SBATCH --output=logs/combo_%a.out
#SBATCH --error=logs/combo_%a.err

# Usage:
#   sbatch run_factorial.sh new-england
#   sbatch run_factorial.sh southwest

BLOCK=${1:-new-england}
mkdir -p logs

python run_factorial.py --combo $SLURM_ARRAY_TASK_ID --block $BLOCK
