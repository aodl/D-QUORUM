/* Test-only process clock alignment. Real-time follows the same explicit
 * PocketIC jumps as the browser; monotonic clocks and all freshness limits
 * remain unchanged. Loaded only into this test's owned PocketIC process. */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdlib.h>
#include <sys/syscall.h>
#include <sys/time.h>
#include <time.h>
#include <unistd.h>

static int64_t offset_ns(void) {
    int saved = errno;
    int64_t value = 0;
    const char *path = getenv("DENDRITE_TEST_CLOCK_FILE");
    if (path) {
        int fd = (int)syscall(SYS_openat, AT_FDCWD, path, O_RDONLY | O_CLOEXEC, 0);
        if (fd >= 0) {
            char text[32] = {0};
            long size = syscall(SYS_read, fd, text, sizeof(text) - 1);
            syscall(SYS_close, fd);
            if (size > 0) {
                char *end;
                long long parsed = strtoll(text, &end, 10);
                if ((*end == '\n' || *end == '\0') && parsed >= 0 &&
                    parsed <= INT64_C(31536000000000000)) value = parsed;
            }
        }
    }
    errno = saved;
    return value;
}
int clock_gettime(clockid_t clock, struct timespec *out) {
    int result = (int)syscall(SYS_clock_gettime, clock, out);
    if (!result && (clock == CLOCK_REALTIME || clock == CLOCK_REALTIME_COARSE)) {
        int64_t ns = offset_ns();
        out->tv_sec += ns / INT64_C(1000000000);
        out->tv_nsec += ns % INT64_C(1000000000);
        if (out->tv_nsec >= 1000000000L) { out->tv_sec++; out->tv_nsec -= 1000000000L; }
    }
    return result;
}
int gettimeofday(struct timeval *restrict out, void *restrict zone) {
    int result = (int)syscall(SYS_gettimeofday, out, zone);
    if (!result) {
        int64_t us = offset_ns() / 1000;
        out->tv_sec += us / INT64_C(1000000);
        out->tv_usec += us % INT64_C(1000000);
        if (out->tv_usec >= 1000000L) { out->tv_sec++; out->tv_usec -= 1000000L; }
    }
    return result;
}
time_t time(time_t *out) {
    struct timespec now;
    if (clock_gettime(CLOCK_REALTIME, &now)) return (time_t)-1;
    if (out) *out = now.tv_sec;
    return now.tv_sec;
}
