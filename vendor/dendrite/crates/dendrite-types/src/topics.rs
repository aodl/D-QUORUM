pub const RECOGNISED_TOPICS: [i32; 18] =
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18];
pub const CURRENT_RECOGNISED_TOPIC_COUNT: usize = RECOGNISED_TOPICS.len();
pub const MAX_FOLLOWEES_PER_TOPIC: usize = 15;
pub const MAX_FOLLOWING_TOPIC_ENTRIES: usize = 64;
pub const MAX_DEPENDENCY_NEURONS: usize = MAX_FOLLOWING_TOPIC_ENTRIES * MAX_FOLLOWEES_PER_TOPIC;

pub fn is_concrete_topic(topic: i32) -> bool {
    topic != 0 && topic != 1
}
