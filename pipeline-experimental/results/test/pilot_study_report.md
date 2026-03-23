# Pilot Study: Factorial Evaluation of Frequency Estimation Methods for Citizen Science Avian Distribution Data

## Methods

### Study Design

We evaluated 9 binary methodological improvements to citizen science bird reporting frequency estimation using a full 2^9 = 512 factorial design. Each combination of methods was applied to the same dataset and evaluated against a held-out validation set, enabling analysis of both main effects and interaction effects between methods.

### Data Source

Observations were drawn from the eBird Basic Dataset (EBD), February 2026 release, restricted to Maine, USA. A pilot subset of 5,000 checklists (24,135 individual observations across 245 species) was used for code validation. These checklists represent the first 5,000 records in the EBD file by file order, which introduces a sampling caveat discussed below.

### Experimental Factors

Nine binary flags were evaluated in factorial combination:

1. **Effort normalization** — exclude checklists shorter than 5 minutes
2. **Complete checklists only** — restrict to checklists where all species were reported
3. **Observer quality weighting** — weight checklists by species richness as a proxy for observer skill
4. **Recency weighting** — exponential decay with 10-year half-life, upweighting recent observations
5. **Area protocol inclusion** — include area-count protocol checklists (normally excluded)
6. **Partial checklist recovery** — include incomplete checklists at 0.3x weight discount
7. **Occupancy correction** — single-season occupancy model separating detection probability from true presence (MacKenzie et al. 2002), fitted via maximum likelihood (L-BFGS-B optimizer, scipy)
8. **Co-occurrence correction** — identify species clusters with >80% bidirectional co-occurrence; correct combined lifer probability for non-independence
9. **Effort debiasing** — inverse-density spatial weighting to reduce urban oversampling, with optional Random Forest residual correction separating habitat signal from effort signal (inspired by Fink et al. 2023)

### Validation Protocol

Checklists were split 80/20 into training and holdout sets using a deterministic hash-based assignment (MD5 of sampling event identifier, seed=42). This ensures identical splits across all 512 runs. Only complete checklists in the holdout set were used for evaluation (n=698 training, holdout size varies by filtering).

For each species, predicted reporting frequency from the training set was compared against observed frequency in the holdout set. Metrics: mean absolute error (MAE) and root mean square error (RMSE) across all species.

### Limitations of Pilot Data

The pilot dataset (first 5,000 file rows) is not a random sample of Maine birding. EBD files are organized by submission order, introducing temporal and spatial clustering. This is evidenced by anomalous species frequencies: Bald Eagle, a common Maine raptor, shows 0% holdout frequency, suggesting the pilot checklists are concentrated in a time period or location where the species was absent. Results validate the computational pipeline but should not be interpreted as biological findings. The full HPC analysis on all 1.66 million Maine checklists will address this limitation.

## Results

### Overall Performance

Of 512 method combinations, 56 (10.9%) outperformed the baseline on MAE. The baseline achieved MAE = 0.00710 and RMSE = 0.01709. The best combination (recency weighting + occupancy correction) achieved MAE = 0.00655 (7.7% improvement) and RMSE = 0.01204 (29.5% improvement).

The MAE distribution across all 512 combinations was bimodal (Figure 2). A cluster of 56 combinations near MAE = 0.0065 represents methods that retain most training data. A larger cluster near MAE = 0.0085 represents combinations that include the `complete_only` flag, which eliminated 85% of checklists and degraded performance despite higher per-checklist data quality.

### Main Effects (Figure 1)

Marginal flag impacts on MAE (averaged across all combinations containing each flag):

| Flag | MAE Change | Direction | Interpretation |
|------|-----------|-----------|----------------|
| Effort debiasing | -1.45 x 10^-3 | Better | Spatial reweighting reduced urban oversampling bias |
| Recency weighting | -0.20 x 10^-3 | Better | Recent observations more predictive of holdout (temporal consistency) |
| Area protocol | +0.00 x 10^-3 | Neutral | Area counts neither helped nor hurt at this sample size |
| Partial recovery | +0.00 x 10^-3 | Neutral | 0.3x discount effectively nullified partial checklist contribution |
| Co-occurrence | +0.00 x 10^-3 | Neutral | Post-hoc probability correction; does not affect per-species frequency |
| Observer weighting | +0.13 x 10^-3 | Worse | Crude richness-based proxy may misweight in small samples |
| Occupancy correction | +0.73 x 10^-3 | Worse | On average, occupancy model introduces noise when data is sparse |
| Complete only | +1.09 x 10^-3 | Worse | 85% data loss overwhelms quality improvement |
| Effort normalize | +1.57 x 10^-3 | Worse | Additional data loss on already-small dataset |

### Interaction Effects

Occupancy correction and recency weighting showed a sub-additive interaction. Individually, occupancy correction reduced MAE by 0.00053 and recency weighting by 0.00029 relative to baseline. Combined, the improvement was 0.00055 — less than the sum of individual improvements (0.00082). This suggests partial redundancy: both methods correct for temporal signal, with recency weighting via explicit decay and occupancy via detection probability changes over time.

### Data Volume-Accuracy Tradeoff (Figure 4)

The `complete_only` flag reduced eligible checklists from ~2,800 to ~167 (a 94% reduction in the pilot subset). This produced a clear separation in Figure 4: all combinations with `complete_only` active clustered at high MAE (>0.008), regardless of which other methods were applied. This demonstrates that at small sample sizes, data volume dominates data quality — retaining more checklists of lower individual quality produces better frequency estimates than fewer high-quality checklists.

This finding may not hold at full scale (1.66 million checklists), where complete checklists alone may number >200,000 — sufficient for robust estimation. The HPC analysis will test this.

### Per-Species Analysis (Figure 3)

Of 253 species present in both baseline and best-combination outputs, 152 (60%) showed reduced error under the best combination. The largest improvement was for Bald Eagle (absolute error reduced from 0.208 to 0.073), though this result is unreliable due to the pilot data's 0% holdout frequency for this species (see Limitations).

Species most harmed by the best combination were low-frequency shorebirds and raptors (Osprey, Pectoral Sandpiper, White-rumped Sandpiper) where the occupancy model's detection correction pushed already-low predicted frequencies closer to zero, overshooting the true holdout frequency. This suggests the occupancy model may require a minimum detection threshold to avoid over-correcting rare species.

### Top Combinations (Figure 5)

The top 20 combinations share a consistent pattern:
- **Occupancy correction** appears in all top 20
- **Recency weighting** appears in 8 of top 10
- **Complete only** and **effort normalize** are absent from all top 20
- Neutral flags (area protocol, co-occurrence, partial recovery) appear sporadically with negligible impact

This suggests a core improvement set of {recency_weight, occupancy_correction} with optional additions that neither help nor hurt significantly.

## Discussion

### Preliminary Conclusions (Pilot Only)

1. **Data volume matters more than data quality at small scales.** The `complete_only` flag, despite being the gold standard for eBird analyses, catastrophically degraded performance on 5,000 checklists. At full scale, this relationship may reverse.

2. **Occupancy correction is promising but noisy.** On average it worsened MAE (+0.73), but it appeared in all top 20 combinations. This paradox arises because it helps substantially for common species (reducing overestimation) but hurts for rare species (over-correcting to near-zero). Per-species method selection — applying occupancy only to species above a frequency threshold — would likely improve results.

3. **Recency weighting is consistently beneficial.** A 10-year half-life improved predictions across the board, consistent with the ecological reality that species distributions shift over decades.

4. **Effort debiasing shows contradictory signals.** It had the largest marginal MAE improvement (-1.45) but simultaneously increased RMSE. This indicates it corrected average bias (good) but introduced more extreme per-species errors (bad). The Random Forest component may overfit on small data.

### Next Steps

1. Run full factorial on 1.66 million Maine checklists + 4.44 million NH/MA checklists
2. Evaluate per-species method assignment using species traits (difficulty, habitat, spatial extent)
3. Test generalizability across 5 ecologically distinct state blocks
4. Implement user skill calibration as a post-hoc detection probability modifier

## References

- Fink, D., et al. (2023). A double machine learning trend model for citizen science data. *Methods in Ecology and Evolution*, 14, 2435-2448.
- MacKenzie, D.I., et al. (2002). Estimating site occupancy rates when detection probabilities are less than one. *Ecology*, 83, 2248-2255.
- Sullivan, B.L., et al. (2014). The eBird enterprise: An integrated approach to development and application of citizen science. *Biological Conservation*, 169, 31-40.

## Figures

- **Figure 1**: Marginal impact of each experimental flag on MAE (`fig1_flag_impact.png`)
- **Figure 2**: Distribution of MAE across all 512 method combinations (`fig2_mae_distribution.png`)
- **Figure 3**: Per-species error comparison — baseline vs. best combination (`fig3_species_scatter.png`)
- **Figure 4**: Data volume vs. accuracy, colored by `complete_only` flag (`fig4_volume_vs_accuracy.png`)
- **Figure 5**: Flag composition of top 20 combinations (`fig5_top20_flags.png`)
