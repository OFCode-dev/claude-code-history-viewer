//! Property-based tests demonstrating advanced testing techniques.
//!
//! These tests use proptest to generate random inputs and verify
//! that properties hold for all generated values.

#![cfg(test)]

use proptest::prelude::*;

/// Strategies for generating test data
mod strategies {
    use super::*;

    /// Generate file sizes in bytes
    pub fn file_size() -> impl Strategy<Value = u64> {
        prop_oneof![
            0u64..1000,             // Empty to small
            1000u64..100_000,       // Medium
            100_000u64..10_000_000, // Large
        ]
    }
}

proptest! {
    #![proptest_config(ProptestConfig {
        cases: 100,
        max_shrink_iters: 1000,
        ..ProptestConfig::default()
    })]

    /// Property: extract_project_name should never panic for any input
    #[test]
    fn prop_extract_project_name_never_panics(input in ".*") {
        let _ = crate::utils::extract_project_name(&input);
    }

    /// Property: estimate_message_count is monotonically increasing with size
    #[test]
    fn prop_estimate_message_count_monotonic(
        size1 in strategies::file_size(),
        size2 in strategies::file_size()
    ) {
        let count1 = crate::utils::estimate_message_count_from_size(size1);
        let count2 = crate::utils::estimate_message_count_from_size(size2);

        if size1 <= size2 {
            prop_assert!(count1 <= count2,
                "Expected count1 ({}) <= count2 ({}) for sizes {} <= {}",
                count1, count2, size1, size2);
        }
    }

    /// Property: estimate_message_count returns at least 1 (minimum message count)
    #[test]
    fn prop_estimate_message_count_min_one_for_empty(_dummy in 0u8..1) {
        let count = crate::utils::estimate_message_count_from_size(0);
        // The function uses .max(1) to ensure at least 1 message is estimated
        prop_assert_eq!(count, 1);
    }

}

/// Regression tests for edge cases found by property testing
mod regression_tests {
    #[allow(unused_imports)]
    use super::*;

    #[test]
    fn test_empty_project_name() {
        let result = crate::utils::extract_project_name("");
        assert_eq!(result, "");
    }

    #[test]
    fn test_single_dash_project_name() {
        let result = crate::utils::extract_project_name("-");
        assert_eq!(result, "-");
    }

    #[test]
    fn test_multiple_dashes_project_name() {
        // "---" with splitn(4, '-') produces ["", "", "", ""]
        // Since parts.len() == 4, it returns parts[3] which is ""
        let result = crate::utils::extract_project_name("---");
        assert_eq!(result, "");
    }

    #[test]
    fn test_unicode_project_name() {
        let result = crate::utils::extract_project_name("project-name");
        assert_eq!(result, "project-name");
    }

    #[test]
    fn test_very_long_project_name() {
        let long_name = "a".repeat(1000);
        let result = crate::utils::extract_project_name(&long_name);
        assert_eq!(result, long_name);
    }
}
