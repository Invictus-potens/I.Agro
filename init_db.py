from sqlalchemy.exc import OperationalError
from app.services.database import create_tables
from app.models import User, Farm, Location, CurrentWeather, ForecastDay, ForecastHour

def init_db():
    print("Creating database tables...")
    try:
        create_tables()
        print("Tables created successfully!")
    except OperationalError as e:
        print(f"Error creating tables: {e}")
        print("Is the database running and accessible?")

import time

if __name__ == "__main__":
    for i in range(5):
        try:
            init_db()
            break
        except Exception as e:
            print(f"Attempt {i+1} failed: {e}")
            time.sleep(5)
