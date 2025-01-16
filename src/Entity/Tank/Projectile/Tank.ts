/*
    DiepCustom - custom tank game server that shares diep.io's WebSocket protocol
    Copyright (C) 2022 ABCxFF (github.com/ABCxFF)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program. If not, see <https://www.gnu.org/licenses/>
*/

import Barrel from "../Barrel";
import Bullet from "./Bullet";
import { AI, AIState } from "../../AI";
import Drone from "./Drone";
import { Entity } from "../../../Native/Entity";
import { 
    InputFlags, 
    PhysicsFlags, 
    StyleFlags,
    PositionFlags,
    Stat,
    HealthFlags
} from "../../../Const/Enums";
import { EntityStateFlags } from "../../../Native/Entity";
import { TankDefinition } from "../../../Const/TankDefinitions";
import { Inputs } from "../../AI";
import { BarrelBase } from "../TankBody";
import { CameraEntity } from "../../../Native/Camera";

/**
 * 代表游戏中的坦克形子弹
 */

/**
 * 参数提示
 * "tankDefinitionId" 是tank定义的ID,-1表示随机tankdefinition
 * "isDroneMode" 是是否为drone模式,-1表示随机drone或者bullet模式
 */
export default class TankProjectile extends Bullet implements BarrelBase {
    /** 默认旋转速度 */
    public static readonly BASE_ROTATION = 0.1;
    /** 最大休息半径 */
    private static readonly MAX_RESTING_RADIUS = 400;

    /** 坦克的炮管 */
    private tankBarrels: Barrel[] = [];
    /** 相机实体（用于队伍） */
    public cameraEntity!: CameraEntity;
    /** 炮管的装填时间 */
    public reloadTime = 15;
    /** 射击输入控制 */
    public inputs!: Inputs;
    /** 每tick的旋转角度 */
    private rotationPerTick = TankProjectile.BASE_ROTATION;
    /** AI控制器 */
    public ai!: AI;
    /** 是否可以控制无人机 */
    public canControlDrones: boolean = false;
    /** 无人机是否在休息状态 */
    private restCycle = true;
    /** 是否为无人机模式 */
    private readonly isDroneMode: boolean;

    public constructor(
        barrel: Barrel, 
        tank: BarrelBase, 
        tankDefinition: TankDefinition | null, 
        shootAngle: number, 
        direction: number, 
        isDroneMode: boolean = false
    ) {
        super(barrel, tank, tankDefinition, shootAngle);
        
        this.isDroneMode = isDroneMode;
        this.usePosAngle = isDroneMode;
        
        // 确保继承 tank 的输入
        this.inputs = tank.inputs;
        
        // 初始化相机实体（用于团队）
        this.cameraEntity = tank.cameraEntity;
        
        this.initializeProjectile(barrel, tank, tankDefinition, shootAngle, direction);
    }

    private initializeProjectile(
        barrel: Barrel, 
        tank: BarrelBase, 
        tankDefinition: TankDefinition | null, 
        shootAngle: number, 
        direction: number
    ): void {
        const bulletDefinition = barrel.definition.bullet;

        // 基础属性设置
        this.baseAccel = barrel.bulletAccel;
        this.setupSpeed(barrel);
        this.rotationPerTick = direction;
        this.cameraEntity = tank.cameraEntity;
        this.canControlDrones = true;

        // 创建炮管
        this.createBarrels(tankDefinition);

        // 设置输入
        this.setupInputs();

        if (this.isDroneMode) {
            this.initializeDroneMode(barrel, tank, bulletDefinition);
        } else {
            this.initializeNormalMode(barrel, tank, bulletDefinition, shootAngle);
        }
    }

    private setupSpeed(barrel: Barrel): void {
        if (this.isDroneMode) {
            this.baseSpeed = barrel.bulletAccel / 3;
            this.baseAccel = 20;
        } else {
            this.baseSpeed = barrel.bulletAccel + 30;
            this.baseAccel = 20;
        }
    }

    private createBarrels(tankDefinition: TankDefinition | null): void {
        if (tankDefinition?.barrels) {
            for (const barrelDefinition of tankDefinition.barrels) {
                const newBarrel = new Barrel(this, { ...barrelDefinition });
                newBarrel.styleData.values.color = this.styleData.values.color;
                this.tankBarrels.push(newBarrel);
            }
        }
    }

    private setupInputs(): void {
        // 继承父实体的输入
        this.inputs = this.tank.inputs;
        this.inputs.flags |= InputFlags.leftclick;
    }

    private initializeDroneMode(barrel: Barrel, tank: BarrelBase, bulletDefinition: any): void {
        this.ai = new AI(this);
        this.setupDroneAI(tank);
        this.setupDronePhysics(bulletDefinition);
        this.setupDroneLifeLength(barrel);
        
        this.baseSpeed /= 3;
        barrel.droneCount += 1;
    }

    private setupDroneAI(tank: BarrelBase): void {
        this.ai.viewRange = 850 * tank.sizeFactor;
        this.ai.targetFilter = (targetPos) => {
            const dx = targetPos.x - this.tank.positionData.values.x;
            const dy = targetPos.y - this.tank.positionData.values.y;
            return (dx * dx + dy * dy) <= this.ai.viewRange ** 2;
        };
        this.ai.movementSpeed = this.ai.aimSpeed = this.baseAccel;
    }

    private setupDronePhysics(bulletDefinition: any): void {
        // 检查发射者是否为 TankBody 的实例
        this.physicsData.values.sides = this.tank.rootParent === this.tank ? 1 : 3;
        
        this.physicsData.values.flags &= ~PhysicsFlags.noOwnTeamCollision;
        this.physicsData.values.flags |= PhysicsFlags.onlySameOwnerCollision;
        this.physicsData.values.flags &= ~PhysicsFlags.canEscapeArena;
        this.styleData.values.flags &= ~StyleFlags.hasNoDmgIndicator;
        
        this.physicsData.values.pushFactor = 4;
        this.physicsData.values.absorbtionFactor = bulletDefinition.absorbtionFactor;
    }

    private setupDroneLifeLength(barrel: Barrel): void {
        this.lifeLength = barrel.definition.bullet.lifeLength !== -1 
            ? 88 * barrel.definition.bullet.lifeLength 
            : Infinity;
        this.deathAccelFactor = 1;
    }

    private initializeNormalMode(barrel: Barrel, tank: BarrelBase, bulletDefinition: any, shootAngle: number): void {
        this.setupNormalModeBasics(tank, shootAngle);
        this.setupNormalModePhysics(bulletDefinition, tank);
        this.setupNormalModeStats(bulletDefinition, tank);
        this.positionProjectile(tank, barrel, shootAngle);
    }

    private setupNormalModeBasics(tank: BarrelBase, shootAngle: number): void {
        this.tank = tank;
        this.movementAngle = shootAngle;
        this.relationsData.values.team = this.barrelEntity.relationsData.values.team;
        this.relationsData.values.owner = tank;
    }

    private setupNormalModePhysics(bulletDefinition: any, tank: BarrelBase): void {
        this.physicsData.values.sides = bulletDefinition.sides ?? 1;
        this.physicsData.values.flags |= PhysicsFlags.noOwnTeamCollision | PhysicsFlags.canEscapeArena;
        
        if (tank.positionData.values.flags & PositionFlags.canMoveThroughWalls) {
            this.positionData.values.flags |= PositionFlags.canMoveThroughWalls;
        }
    }

    private setupNormalModeStats(bulletDefinition: any, tank: BarrelBase): void {
        const statLevels = tank.cameraEntity.cameraData?.values.statLevels.values;
        const bulletDamage = statLevels ? statLevels[Stat.BulletDamage] : 0;
        const bulletPenetration = statLevels ? statLevels[Stat.BulletPenetration] : 0;

        this.healthData.values.health = this.healthData.values.maxHealth = (1.5 * bulletPenetration + 2) * bulletDefinition.health;
        this.damagePerTick = (7 + bulletDamage * 3) * bulletDefinition.damage;
        this.damageReduction = 0.25;
        this.lifeLength = bulletDefinition.lifeLength * 72;
    }

    private positionProjectile(tank: BarrelBase, barrel: Barrel, shootAngle: number): void {
        const {x, y} = tank.getWorldPosition();
        const sizeFactor = tank.sizeFactor;
        
        this.positionData.values.x = x + 
            (Math.cos(shootAngle) * barrel.physicsData.values.size) - 
            Math.sin(shootAngle) * barrel.definition.offset * sizeFactor + 
            Math.cos(shootAngle) * (barrel.definition.distance || 0);
            
        this.positionData.values.y = y + 
            (Math.sin(shootAngle) * barrel.physicsData.values.size) + 
            Math.cos(shootAngle) * barrel.definition.offset * sizeFactor + 
            Math.sin(shootAngle) * (barrel.definition.distance || 0);
            
        this.positionData.values.angle = shootAngle;
    }

    public get sizeFactor(): number {
        return this.physicsData.values.size / 50;
    }

    protected tickMixin(tick: number): void {
        super.tick(tick);
    }

    private tickDroneMode(tick: number): void {
        this.ai.tick(tick);
        
        const usingAI = !this.canControlDrones || 
            this.tank.inputs.deleted || 
            (!this.tank.inputs.attemptingShot() && !this.tank.inputs.attemptingRepel());
            
        const inputs = !usingAI ? this.tank.inputs : this.ai.inputs;

        if (usingAI && this.ai.state === AIState.idle) {
            this.handleIdleDrone();
        } else {
            this.handleActiveDrone(inputs);
        }
    }

    private handleIdleDrone(): void {
        const delta = {
            x: this.positionData.values.x - this.tank.positionData.values.x,
            y: this.positionData.values.y - this.tank.positionData.values.y
        };
        const base = this.baseAccel;

        let unitDist = (delta.x ** 2 + delta.y ** 2) / TankProjectile.MAX_RESTING_RADIUS;
        if (unitDist <= 1 && this.restCycle) {
            this.handleRestingDrone(unitDist);
        } else {
            this.handleOrbitingDrone(delta);
        }

        this.baseAccel = base;
    }

    private handleRestingDrone(unitDist: number): void {
        this.baseAccel /= 6;
        this.positionData.angle += 0.01 + 0.012 * unitDist;
    }

    private handleOrbitingDrone(delta: {x: number, y: number}): void {
        const offset = Math.atan2(delta.y, delta.x) + Math.PI / 2;
        delta.x = this.tank.positionData.values.x + 
            Math.cos(offset) * this.tank.physicsData.values.size * 1.2 - 
            this.positionData.values.x;
        delta.y = this.tank.positionData.values.y + 
            Math.sin(offset) * this.tank.physicsData.values.size * 1.2 - 
            this.positionData.values.y;
            
        this.positionData.angle = Math.atan2(delta.y, delta.x);
        
        const distSq = delta.x ** 2 + delta.y ** 2;
        if (distSq < 0.5) this.baseAccel /= 3;
        this.restCycle = distSq <= 4 * (this.tank.physicsData.values.size ** 2);
    }

    private handleActiveDrone(inputs: Inputs): void {
        // 使用根实体(root tank)的输入来控制 drone
        const rootTank = (this.tank.rootParent as BarrelBase) || this.tank;
        const mousePosition = rootTank.inputs.mouse;
        
        this.positionData.angle = Math.atan2(
            mousePosition.y - this.positionData.values.y,
            mousePosition.x - this.positionData.values.x
        );
        this.restCycle = false;

        if (this.canControlDrones && inputs.attemptingRepel()) {
            this.positionData.angle += Math.PI;
        }
    }

    private tickNormalMode(tick: number): void {
        super.tick(tick);

        if (tick === this.spawnTick + 1) {
            this.addAcceleration(this.movementAngle, this.baseSpeed);
        } else {
            this.maintainVelocity(
                this.usePosAngle ? this.positionData.values.angle : this.movementAngle,
                this.baseAccel
            );
        }

        if (tick - this.spawnTick >= this.lifeLength) {
            this.destroy(true);
        }

        if ((this.relationsData.values.team?.entityState || 0) & EntityStateFlags.needsDelete) {
            this.relationsData.values.team = null;
        }
    }

    public destroy(animate = true) {
        // 如果是无人机模式，减少无人机计数
        if (this.isDroneMode && !animate) {
            this.barrelEntity.droneCount -= 1;
        }

        // 确保所有子炮管都被销毁
        for (const barrel of this.tankBarrels) {
            barrel.destroy();
        }

        // 立即销毁，不等待动画
        super.destroy(animate);
    }

    public tick(tick: number): void {
        // 检查 tank 是否已经死亡或被删除
        if (!Entity.exists(this.tank) || this.tank.inputs.deleted) {
            this.destroy(false);  // 使用 false 来立即销毁，不等待动画
            return;
        }

        if (this.isDroneMode) {
            this.tickDroneMode(tick);
        } else {
            this.tickNormalMode(tick);
        }

        if (!Entity.exists(this.barrelEntity)) {
            this.destroy();
            return;
        }

        for (const barrel of this.tankBarrels) {
            barrel.tick(tick);
        }

        this.tickMixin(tick);
    }
} 