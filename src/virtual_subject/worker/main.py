import logging
import time

from virtual_subject.config import get_settings

settings = get_settings()
logger = logging.getLogger("virtual_subject.worker")


def main() -> None:
    logging.basicConfig(level=settings.log_level)
    logger.info("worker started in %s mode", settings.tribe_mode)
    while True:
        logger.debug("worker heartbeat")
        time.sleep(settings.worker_poll_seconds)


if __name__ == "__main__":
    main()

