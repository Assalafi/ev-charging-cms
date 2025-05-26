#!/bin/bash

# EV Charging CMS Setup Script
# This script automates the setup process for the EV Charging CMS

# Color codes for output formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Set working directory to project root
cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}    EV Charging CMS - Setup Script                    ${NC}"
echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}Project root: ${PROJECT_ROOT}${NC}"
echo ""

# Check required tools
echo -e "${YELLOW}Checking required tools...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    echo "Please install Node.js (v14 or later) and try again."
    exit 1
fi
NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js is installed: ${NODE_VERSION}${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed.${NC}"
    echo "Please install npm and try again."
    exit 1
fi
NPM_VERSION=$(npm -v)
echo -e "${GREEN}✓ npm is installed: ${NPM_VERSION}${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Warning: Docker is not installed. Docker is recommended for running PostgreSQL and EMQX.${NC}"
else
    DOCKER_VERSION=$(docker --version)
    echo -e "${GREEN}✓ Docker is installed: ${DOCKER_VERSION}${NC}"
fi

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}Warning: Docker Compose is not installed. Docker Compose is recommended for running services.${NC}"
else
    DOCKER_COMPOSE_VERSION=$(docker-compose --version)
    echo -e "${GREEN}✓ Docker Compose is installed: ${DOCKER_COMPOSE_VERSION}${NC}"
fi

# Check PostgreSQL client
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}Warning: PostgreSQL client (psql) is not installed. It's required for database initialization.${NC}"
else
    PSQL_VERSION=$(psql --version)
    echo -e "${GREEN}✓ PostgreSQL client is installed: ${PSQL_VERSION}${NC}"
fi

echo ""
echo -e "${YELLOW}Setting up EV Charging CMS...${NC}"

# 1. Install backend dependencies
echo -e "${BLUE}Installing backend dependencies...${NC}"
cd "${PROJECT_ROOT}/backend"
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to install backend dependencies.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Backend dependencies installed successfully.${NC}"

# 2. Install frontend dependencies
echo -e "${BLUE}Installing frontend dependencies...${NC}"
cd "${PROJECT_ROOT}/frontend"
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to install frontend dependencies.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Frontend dependencies installed successfully.${NC}"

# 3. Check if Docker services are running
echo -e "${BLUE}Checking Docker services...${NC}"
if command -v docker-compose &> /dev/null; then
    cd "${PROJECT_ROOT}"
    if docker-compose ps | grep -q "Up"; then
        echo -e "${GREEN}✓ Some Docker services are already running.${NC}"
    else
        echo -e "${YELLOW}No Docker services are currently running.${NC}"
        read -p "Do you want to start Docker services now? (y/n): " start_docker
        if [[ "$start_docker" =~ ^[Yy]$ ]]; then
            docker-compose up -d
            if [ $? -ne 0 ]; then
                echo -e "${RED}Error: Failed to start Docker services.${NC}"
                echo "Please check docker-compose.yml and try again."
            else
                echo -e "${GREEN}✓ Docker services started successfully.${NC}"
            fi
        else
            echo -e "${YELLOW}Skipping Docker services startup.${NC}"
        fi
    fi
else
    echo -e "${YELLOW}Docker Compose is not installed. Skipping Docker services check.${NC}"
fi

# 4. Initialize database
echo -e "${BLUE}Initializing database...${NC}"
cd "${PROJECT_ROOT}"
if command -v psql &> /dev/null; then
    ./scripts/init-db.sh
    if [ $? -ne 0 ]; then
        echo -e "${RED}Error: Failed to initialize database.${NC}"
        echo "Please check database settings and try again."
    else
        echo -e "${GREEN}✓ Database initialized successfully.${NC}"
    fi
else
    echo -e "${RED}PostgreSQL client is not installed. Skipping database initialization.${NC}"
    echo "Please install PostgreSQL client and run ./scripts/init-db.sh manually."
fi

# 5. Create uploads directories
echo -e "${BLUE}Creating upload directories...${NC}"
mkdir -p "${PROJECT_ROOT}/backend/uploads/firmware"
mkdir -p "${PROJECT_ROOT}/backend/uploads/logs"
echo -e "${GREEN}✓ Upload directories created.${NC}"

# Setup complete
echo ""
echo -e "${GREEN}======================================================${NC}"
echo -e "${GREEN}    EV Charging CMS - Setup Complete                  ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo ""
echo -e "${BLUE}To start the backend server:${NC}"
echo "cd ${PROJECT_ROOT}/backend && npm start"
echo ""
echo -e "${BLUE}To start the frontend development server:${NC}"
echo "cd ${PROJECT_ROOT}/frontend && npm start"
echo ""
echo -e "${BLUE}To start all services using Docker Compose:${NC}"
echo "cd ${PROJECT_ROOT} && docker-compose up -d"
echo ""
echo -e "${YELLOW}Note: Make sure PostgreSQL and EMQX MQTT broker are running before starting the backend.${NC}"
echo -e "${YELLOW}Default admin login: username: admin, password: admin123${NC}"
echo ""
